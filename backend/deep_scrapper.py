import asyncio
import json
import logging
from urllib.parse import urldefrag, urljoin, urlparse
from bs4 import BeautifulSoup
from playwright.async_api import async_playwright

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


class DeepCrawler:
    def __init__(self, start_url: str, max_concurrency: int = 5, timeout_ms: int = 30000):
        self.start_url = start_url
        self.target_domain = urlparse(start_url).netloc
        self.visited = set()
        self.queue = asyncio.Queue()
        self.max_concurrency = max_concurrency
        self.timeout_ms = timeout_ms
        self.scraped_data = []

    def is_internal_url(self, url: str) -> bool:
        """Ensure the URL stays within the same host domain."""
        parsed = urlparse(url)
        return parsed.netloc == self.target_domain and parsed.scheme in ("http", "https")

    def clean_url(self, url: str) -> str:
        """Strip URL fragments and trailing slashes for exact deduplication."""
        defragged, _ = urldefrag(url)
        return defragged.rstrip("/")

    async def parse_page(self, page_url: str, html: str) -> list[str]:
        """Extract all text, structured metadata, and internal links."""
        soup = BeautifulSoup(html, "html.parser")

        # Remove non-content structural elements
        for tag in soup(["script", "style", "noscript", "svg", "header", "footer", "nav"]):
            tag.decompose()

        title = soup.title.string.strip() if soup.title else ""
        headings = [h.get_text(strip=True) for h in soup.find_all(["h1", "h2", "h3"])]
        body_text = " ".join(soup.stripped_strings)

        # Store page record
        self.scraped_data.append({
            "url": page_url,
            "title": title,
            "headings": headings,
            "content": body_text[:5000],  # truncated sample per page
        })

        # Discover internal links
        new_links = []
        for anchor in soup.find_all("a", href=True):
            absolute_url = self.clean_url(urljoin(page_url, anchor["href"]))
            if self.is_internal_url(absolute_url) and absolute_url not in self.visited:
                new_links.append(absolute_url)

        return new_links

    async def worker(self, context):
        """Asynchronous worker pulling URLs from the queue."""
        page = await context.new_page()

        while True:
            try:
                current_url = await self.queue.get()
                if current_url in self.visited:
                    self.queue.task_done()
                    continue

                self.visited.add(current_url)
                logging.info(f"Crawling ({len(self.visited)} visited): {current_url}")

                try:
                    # Navigate and wait for DOM content to settle
                    response = await page.goto(
                        current_url,
                        wait_until="domcontentloaded",
                        timeout=self.timeout_ms,
                    )

                    if response and response.status < 400:
                        content = await page.content()
                        discovered_links = await self.parse_page(current_url, content)

                        for link in discovered_links:
                            if link not in self.visited:
                                await self.queue.put(link)
                    else:
                        status = response.status if response else "No response"
                        logging.warning(f"Failed [{status}]: {current_url}")

                except Exception as e:
                    logging.error(f"Error fetching {current_url}: {e}")

                finally:
                    self.queue.task_done()

            except asyncio.CancelledError:
                break

        await page.close()

    async def run(self):
        normalized_start = self.clean_url(self.start_url)
        await self.queue.put(normalized_start)

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(
                user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                           "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            )

            # Spawn worker pool
            tasks = [
                asyncio.create_task(self.worker(context))
                for _ in range(self.max_concurrency)
            ]

            # Wait until the entire URL queue has been drained
            await self.queue.join()

            # Cancel remaining workers
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)

            await browser.close()

        # Save extracted data
        output_file = "crawled_site.json"
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(self.scraped_data, f, indent=2, ensure_ascii=False)

        logging.info(f"Complete. Scraped {len(self.scraped_data)} pages. Saved to {output_file}")


if __name__ == "__main__":
    target = "https://webscraper.io/test-sites/pagination/BMW"
    crawler = DeepCrawler(start_url=target, max_concurrency=4)
    asyncio.run(crawler.run())
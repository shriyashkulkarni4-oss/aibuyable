"""
Playwright Deep Crawler Service — Async Headless Chromium Engine for AIBuyable Gateway.

Capabilities:
1. Executes Client-Side JavaScript (React, Vue, Shopify, Next.js, Wix, etc.) via Playwright.
2. Concurrent crawling using asyncio.Queue with configurable worker pool.
3. Multi-Currency Detection (USD, INR, EUR, GBP, CAD, AUD).
4. Dual Extraction Pipeline:
   - Primary: JSON-LD Structured Schema (<script type="application/ld+json"> with @type: Product)
   - Secondary: Native product card detector (article.product_pod, div.product-item, etc.)
   - Fallback: High-precision HTML Heuristic Scraper (h1, og:title, og:image, price regex)
5. Pagination-aware: follows "next page" links automatically.
6. Category-aware: extracts genre/category from breadcrumb or URL.
7. Deduplication by URL slug (external_id) — not by name — for correctness.
8. Stops exactly at max_products (default 100) distinct products.
9. Upserts extracted products directly into PostgreSQL for the target merchant.
10. Writes audit logs and updates merchant.crawl_status ('crawling', 'completed', 'failed').
"""

import asyncio
import json
import re
import uuid
import logging
from datetime import datetime
from typing import Optional
from urllib.parse import urljoin, urlparse, urldefrag
from bs4 import BeautifulSoup
from sqlalchemy.orm import Session
from playwright.async_api import async_playwright

from app.models.product import Product
from app.models.merchant import Merchant
from app.audit.audit_logger import log_event

logger = logging.getLogger(__name__)

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 AIBuyableCrawler/2.0"
)

# Matches prices like: £12.99, $19.99, USD 5.00, ₹999, €15.00
CURRENCY_REGEX = re.compile(
    r"(?:(USD|\$|₹|INR|EUR|€|GBP|£|CAD|AUD)\s*([0-9,]+(?:\.[0-9]{1,2})?))|"
    r"(?:([0-9,]+(?:\.[0-9]{1,2})?)\s*(USD|INR|EUR|GBP|CAD|AUD))",
    re.IGNORECASE,
)

CURRENCY_SYMBOL_MAP = {
    "$": "USD", "USD": "USD",
    "₹": "INR", "INR": "INR",
    "€": "EUR", "EUR": "EUR",
    "£": "GBP", "GBP": "GBP",
    "CAD": "CAD", "AUD": "AUD",
}

# URL patterns that are clearly NOT product pages — skip these
SKIP_URL_PATTERNS = re.compile(
    r"/(login|logout|signup|register|cart|checkout|account|wishlist|"
    r"contact|about|blog|news|faq|search|404|sitemap|privacy|terms|"
    r"robots\.txt|\.xml|\.json|graphql|api/)",
    re.IGNORECASE,
)

# URL patterns that are likely product listing / category pages
LISTING_URL_PATTERNS = re.compile(
    r"/(product|products|catalogue|catalog|category|shop|store|"
    r"collection|collections|items|browse|page)",
    re.IGNORECASE,
)

# Generic product card CSS class patterns
CARD_CLASS_PATTERN = re.compile(
    r"(product[-_]?pod|product[-_]?card|product[-_]?item|item[-_]?card|"
    r"thumbnail|listing[-_]?item|grid[-_]?item|catalog[-_]?item|"
    r"product[-_]?tile|book[-_]?card)",
    re.IGNORECASE,
)


class PlaywrightDeepCrawler:
    def __init__(
        self,
        start_url: str,
        merchant_id: str,
        db: Session,
        max_concurrency: int = 3,
        max_pages: int = 60,
        max_products: int = 20,
        timeout_ms: int = 30000,
    ):
        self.start_url = start_url
        self.target_domain = urlparse(start_url).netloc
        self.merchant_id = merchant_id
        self.db = db
        self.visited = set()
        # Priority queue: 0 = listing/category pages first, 1 = everything else
        self.queue: asyncio.Queue = asyncio.Queue()
        self.max_concurrency = max_concurrency
        self.max_pages = max_pages
        self.max_products = max_products
        self.timeout_ms = timeout_ms
        # Keyed by external_id (URL slug) — prevents same product scraped twice
        self.extracted_products: dict[str, dict] = {}

    @property
    def product_count(self) -> int:
        return len(self.extracted_products)

    def is_internal_url(self, url: str) -> bool:
        parsed = urlparse(url)
        return parsed.netloc == self.target_domain and parsed.scheme in ("http", "https")

    def clean_url(self, url: str) -> str:
        defragged, _ = urldefrag(url)
        return defragged.rstrip("/")

    def should_skip_url(self, url: str) -> bool:
        return bool(SKIP_URL_PATTERNS.search(url))

    def is_listing_url(self, url: str) -> bool:
        return bool(LISTING_URL_PATTERNS.search(url))

    def extract_price_and_currency(self, text: str) -> tuple[float, str]:
        match = CURRENCY_REGEX.search(text)
        if match:
            curr_str = match.group(1) or match.group(4) or "USD"
            price_str = match.group(2) or match.group(3) or "0.0"
            currency = CURRENCY_SYMBOL_MAP.get(curr_str.upper(), "USD")
            try:
                price = float(price_str.replace(",", ""))
                return price, currency
            except ValueError:
                pass
        return 0.0, "USD"

    def _url_to_external_id(self, url: str) -> str:
        """Stable slug from the URL path — used as dedup key.
        
        Examples:
          /catalogue/a-light-in-the-attic_1000/index.html  → a-light-in-the-attic_1000
          /products/blue-sneaker-42                         → blue-sneaker-42
          /shop/item?id=123                                 → full URL as fallback
        """
        path = urlparse(url).path.rstrip("/")
        parts = [p for p in path.split("/") if p]
        if not parts:
            return url
        last = parts[-1]
        # Strip file extensions
        last_clean = re.sub(r"\.(html?|php|aspx?)$", "", last, flags=re.IGNORECASE)
        # If last segment is a generic filename like 'index', use parent folder as slug
        if last_clean.lower() in ("index", "default", "product", "item") and len(parts) >= 2:
            return parts[-2]
        return last_clean or url

    def extract_category_from_breadcrumb(self, soup: BeautifulSoup) -> str:
        """Extract the deepest meaningful breadcrumb item (skip Home/Books/Shop)."""
        SKIP_CRUMBS = {"home", "shop", "books", "store", "all", "products"}
        # Try standard breadcrumb patterns
        for selector in ["ul.breadcrumb", "nav.breadcrumb", ".breadcrumbs", "[aria-label='breadcrumb']"]:
            bc = soup.select(selector)
            if bc:
                crumbs = [li.get_text(strip=True) for li in bc[0].find_all("li")]
                meaningful = [c for c in crumbs if c.lower() not in SKIP_CRUMBS and c]
                if meaningful:
                    return meaningful[-1]
        return ""

    def extract_category_from_url(self, url: str) -> str:
        """Extract category from URL path segments like /category/books/travel_2/."""
        path = urlparse(url).path.lower()
        # Match patterns like /category/books/travel_2 → "Travel"
        m = re.search(r"/category/[^/]+/([^/]+?)(?:_\d+)?(?:/|$)", path)
        if m:
            return m.group(1).replace("-", " ").title()
        return ""

    # ─── Extractor 1: Native product card detector ────────────────────────────

    def extract_native_product_cards(self, soup: BeautifulSoup, page_url: str) -> list[dict]:
        """
        Detects product cards using known CSS class patterns.
        Works for: books.toscrape.com (article.product_pod),
                   Shopify (.product-card), WooCommerce (.product), etc.
        """
        products = []

        # Strategy A: article/div/li with product-like classes
        containers = soup.find_all(
            lambda tag: tag.name in ("article", "div", "li")
            and tag.has_attr("class")
            and any(CARD_CLASS_PATTERN.search(c) for c in tag["class"])
        )

        # De-nest: keep only top-level containers (O(n) using parent traversal)
        container_set = set(id(c) for c in containers)
        top_level = []
        for c in containers:
            is_nested = False
            for parent in c.parents:
                if id(parent) in container_set and parent is not c:
                    is_nested = True
                    break
            if not is_nested:
                top_level.append(c)

        for container in top_level:
            # Title: prefer <a title="..."> inside h3, or h3 text
            name = ""
            link_url = page_url
            h = container.find(["h2", "h3", "h4"])
            if h:
                a = h.find("a")
                if a:
                    name = a.get("title") or a.get_text(strip=True)
                    href = a.get("href", "")
                    if href:
                        link_url = self.clean_url(urljoin(page_url, href))
                else:
                    name = h.get_text(strip=True)

            if not name or len(name) < 3:
                continue

            # Price
            price_el = container.find(
                class_=re.compile(r"price(?:[-_]color|[-_]amount|[-_]box)?", re.I)
            )
            price_text = price_el.get_text(" ", strip=True) if price_el else container.get_text(" ")
            price, currency = self.extract_price_and_currency(price_text)

            # Image
            image = ""
            img = container.find("img")
            if img:
                image = img.get("src") or img.get("data-src") or img.get("data-lazy-src") or ""
                if image and not image.startswith("http"):
                    image = urljoin(page_url, image)

            # Description
            p_desc = container.find("p", class_=re.compile(r"desc|summary|synopsis", re.I))
            if not p_desc:
                p_desc = container.find("p")
            desc = p_desc.get_text(strip=True) if p_desc else ""

            ext_id = self._url_to_external_id(link_url)

            # Only add if not already seen AND we haven't hit the limit
            if ext_id not in self.extracted_products and self.product_count < self.max_products:
                products.append({
                    "name": name,
                    "price": price,
                    "currency": currency,
                    "image_url": image,
                    "description": desc[:2000],
                    "external_id": ext_id,
                    "source_url": link_url,
                    "raw_scraped_json": {"name": name, "price": price, "currency": currency, "url": link_url},
                    "category": "",  # filled later from breadcrumb/URL
                })

        return products

    # ─── Extractor 2: JSON-LD ────────────────────────────────────────────────

    def extract_jsonld(self, soup: BeautifulSoup, page_url: str) -> list[dict]:
        products = []
        for script in soup.find_all("script", type="application/ld+json"):
            try:
                data = json.loads(script.string or "")
            except (json.JSONDecodeError, TypeError):
                continue

            items = []
            if isinstance(data, list):
                items = data
            elif isinstance(data, dict):
                if data.get("@type") == "Product":
                    items = [data]
                elif "@graph" in data:
                    items = data["@graph"]

            for item in items:
                if item.get("@type") != "Product":
                    continue
                name = item.get("name", "")
                if not name:
                    continue

                price = 0.0
                currency = "USD"
                offers = item.get("offers", {})
                if isinstance(offers, list):
                    offers = offers[0] if offers else {}
                if offers:
                    try:
                        price = float(offers.get("price", 0) or 0)
                    except (ValueError, TypeError):
                        price = 0.0
                    currency = offers.get("priceCurrency", "USD")

                description = item.get("description", "")
                image = item.get("image", "")
                if isinstance(image, list):
                    image = image[0] if image else ""
                if isinstance(image, dict):
                    image = image.get("url", "")

                ext_id = self._url_to_external_id(page_url)
                if ext_id not in self.extracted_products and self.product_count < self.max_products:
                    products.append({
                        "name": name,
                        "description": description[:2000] if description else "",
                        "price": price,
                        "currency": currency.upper() if currency else "USD",
                        "image_url": image,
                        "external_id": ext_id,
                        "source_url": page_url,
                        "raw_scraped_json": item,
                        "category": item.get("category", ""),
                    })
        return products

    # ─── Extractor 3: Fallback HTML heuristic (single product pages) ─────────

    def extract_html_product(self, soup: BeautifulSoup, page_url: str) -> Optional[dict]:
        """Used only when URL looks like a product detail page and no card was found."""
        name = None
        h1 = soup.find("h1")
        if h1:
            name = h1.get_text(strip=True)
        if not name:
            og_title = soup.find("meta", property="og:title")
            if og_title:
                name = og_title.get("content", "")
        if not name or len(name) < 2:
            return None

        price, currency = self.extract_price_and_currency(soup.get_text(" "))
        image = ""
        og_image = soup.find("meta", property="og:image")
        if og_image:
            image = og_image.get("content", "")
        description = ""
        og_desc = soup.find("meta", property="og:description")
        if og_desc:
            description = og_desc.get("content", "")

        ext_id = self._url_to_external_id(page_url)
        if ext_id in self.extracted_products:
            return None

        return {
            "name": name,
            "description": description[:2000],
            "price": price,
            "currency": currency,
            "image_url": image,
            "external_id": ext_id,
            "source_url": page_url,
            "raw_scraped_json": {"url": page_url, "name": name, "price": price, "currency": currency},
            "category": "",
        }

    # ─── Main page parser ────────────────────────────────────────────────────

    def parse_page(self, page_url: str, html: str) -> list[str]:
        """
        Parse a page: extract products + return new URLs to enqueue.
        Returns list of discovered internal URLs.
        """
        if self.product_count >= self.max_products:
            return []

        soup = BeautifulSoup(html, "html.parser")
        category = self.extract_category_from_breadcrumb(soup) or self.extract_category_from_url(page_url)

        new_products = []

        # 1. JSON-LD (highest fidelity — use first if available)
        jsonld = self.extract_jsonld(soup, page_url)
        if jsonld:
            new_products = jsonld

        # 2. Native product cards (listing pages with article.product_pod etc.)
        if not new_products:
            new_products = self.extract_native_product_cards(soup, page_url)

        # 3. Fallback: single product page heuristic
        if not new_products and LISTING_URL_PATTERNS.search(page_url):
            prod = self.extract_html_product(soup, page_url)
            if prod:
                new_products = [prod]

        # Attach category and register extracted products (deduplicated by external_id)
        for p in new_products:
            if self.product_count >= self.max_products:
                break
            ext_id = p.get("external_id", "")
            if ext_id and ext_id not in self.extracted_products:
                if not p.get("category"):
                    p["category"] = category
                self.extracted_products[ext_id] = p

        # Discover new internal links to crawl
        new_links_priority = []  # listing/category pages
        new_links_normal = []    # everything else

        for anchor in soup.find_all("a", href=True):
            href = anchor["href"]
            absolute_url = self.clean_url(urljoin(page_url, href))
            if not self.is_internal_url(absolute_url):
                continue
            if absolute_url in self.visited:
                continue
            if self.should_skip_url(absolute_url):
                continue
            if self.is_listing_url(absolute_url):
                new_links_priority.append(absolute_url)
            else:
                new_links_normal.append(absolute_url)

        # Also look for explicit "next" pagination links
        next_btn = soup.find("li", class_="next") or soup.find(class_=re.compile(r"next[-_]?page|pagination.*next", re.I))
        if next_btn:
            next_a = next_btn.find("a")
            if next_a and next_a.get("href"):
                next_url = self.clean_url(urljoin(page_url, next_a["href"]))
                if next_url not in self.visited and self.is_internal_url(next_url):
                    # Pagination gets top priority
                    new_links_priority.insert(0, next_url)

        # Return priority links first, then normal ones
        return new_links_priority + new_links_normal

    # ─── Async Worker ────────────────────────────────────────────────────────

    async def worker(self, context):
        page = await context.new_page()
        try:
            while self.product_count < self.max_products and len(self.visited) < self.max_pages:
                try:
                    current_url = await asyncio.wait_for(self.queue.get(), timeout=3.0)
                except asyncio.TimeoutError:
                    if self.queue.empty():
                        break
                    continue

                if current_url in self.visited:
                    self.queue.task_done()
                    continue

                self.visited.add(current_url)
                logger.info(
                    f"Playwright Crawling ({len(self.visited)}/{self.max_pages}) "
                    f"[{self.product_count}/{self.max_products} products]: {current_url}"
                )

                try:
                    response = await page.goto(
                        current_url,
                        wait_until="domcontentloaded",
                        timeout=self.timeout_ms,
                    )
                    if response and response.status < 400:
                        content = await page.content()
                        discovered_links = self.parse_page(current_url, content)

                        for link in discovered_links:
                            if (
                                link not in self.visited
                                and self.product_count < self.max_products
                            ):
                                await self.queue.put(link)

                except Exception as e:
                    logger.warning(f"Error fetching {current_url}: {e}")
                finally:
                    self.queue.task_done()

        except asyncio.CancelledError:
            logger.warning(f"Worker cancelled. Visited: {len(self.visited)}, Products: {self.product_count}")
            raise
        finally:
            await page.close()

    # ─── Run ─────────────────────────────────────────────────────────────────

    async def run(self) -> list[dict]:
        normalized_start = self.clean_url(self.start_url)
        await self.queue.put(normalized_start)

        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(user_agent=USER_AGENT)

            tasks = [
                asyncio.create_task(self.worker(context))
                for _ in range(self.max_concurrency)
            ]

            timeout_secs = (self.timeout_ms / 1000) * self.max_pages + 60
            try:
                await asyncio.wait_for(
                    asyncio.gather(*tasks, return_exceptions=True),
                    timeout=timeout_secs,
                )
            except asyncio.TimeoutError:
                logger.warning("Crawler outer timeout hit — cancelling workers.")
                for task in tasks:
                    task.cancel()
                await asyncio.gather(*tasks, return_exceptions=True)

            await browser.close()

        products = list(self.extracted_products.values())
        logger.info(f"Crawl complete. Pages visited: {len(self.visited)}, Products extracted: {len(products)}")
        return products[:self.max_products]


# ─── Background entry point for FastAPI ──────────────────────────────────────

def run_crawl(merchant_id: str, store_url: str, db: Session):
    """
    Main background entry point for FastAPI BackgroundTasks.
    Runs the Playwright crawler and upserts discovered products into PostgreSQL.
    """
    import sys
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsProactorEventLoopPolicy())

    merchant = db.query(Merchant).filter(Merchant.id == merchant_id).first()
    if not merchant:
        return

    merchant.crawl_status = "crawling"
    merchant.crawl_error = None
    db.commit()

    try:
        crawler = PlaywrightDeepCrawler(
            start_url=store_url,
            merchant_id=merchant_id,
            db=db,
            max_concurrency=3,
            max_pages=60,
            max_products=100,
        )

        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            extracted = loop.run_until_complete(crawler.run())
        finally:
            loop.close()

        # ── Upsert products into PostgreSQL ──
        saved_count = 0
        for prod in extracted:
            name = prod.get("name", "").strip()
            if not name:
                continue

            ext_id = prod.get("external_id", "")
            raw_json = prod.get("raw_scraped_json", {})

            # Try to find existing product by external_id
            existing = None
            if ext_id:
                existing = db.query(Product).filter(
                    Product.merchant_id == merchant_id,
                    Product.external_id == ext_id,
                ).first()

            if existing:
                # Update in place
                existing.name = name
                existing.description = prod.get("description", "")
                existing.price = prod.get("price", 0.0)
                existing.currency = prod.get("currency", "USD")
                existing.image_url = prod.get("image_url", "")
                existing.category = prod.get("category", "")
                existing.raw_scraped_json = json.dumps(raw_json, default=str)
                existing.is_active = True
                existing.updated_at = datetime.utcnow()
            else:
                product = Product(
                    id=str(uuid.uuid4()),
                    merchant_id=merchant_id,
                    external_id=ext_id,
                    name=name,
                    description=prod.get("description", ""),
                    price=prod.get("price", 0.0),
                    currency=prod.get("currency", "USD"),
                    stock_qty=100,
                    image_url=prod.get("image_url", ""),
                    category=prod.get("category", ""),
                    raw_scraped_json=json.dumps(raw_json, default=str),
                    is_active=True,
                )
                db.add(product)

            saved_count += 1

        db.commit()

        # Mark any old products from previous crawl that were NOT in this crawl as inactive
        all_current_ext_ids = {p.get("external_id") for p in extracted if p.get("external_id")}
        old_products = db.query(Product).filter(
            Product.merchant_id == merchant_id,
            Product.is_active == True,
        ).all()
        deactivated = 0
        for old in old_products:
            if old.external_id not in all_current_ext_ids:
                old.is_active = False
                deactivated += 1
        if deactivated:
            db.commit()
            logger.info(f"Deactivated {deactivated} stale products from previous crawl.")

        merchant.crawl_status = "completed"
        db.commit()

        log_event(
            db=db,
            merchant_id=merchant_id,
            step="crawl_completed",
            decision="info",
            reason=f"Crawler completed. {saved_count} products upserted, {deactivated} stale products deactivated.",
            actor="system",
            output_snapshot={
                "products_saved": saved_count,
                "products_deactivated": deactivated,
                "store_url": store_url,
            },
        )
        logger.info(f"Playwright crawl completed for merchant {merchant_id}: {saved_count} products indexed.")

    except Exception as e:
        logger.error(f"Playwright crawl failed for merchant {merchant_id}: {e}", exc_info=True)
        merchant.crawl_status = "failed"
        merchant.crawl_error = str(e)
        db.commit()

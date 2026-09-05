import asyncio
from app.crawler.crawler import PlaywrightDeepCrawler
from app.db import SessionLocal

async def main():
    db = SessionLocal()
    crawler = PlaywrightDeepCrawler("https://web-scraping.dev/products", "demo", db)
    res = await crawler.run()
    print("Crawler Run Returned Products Count:", len(res))
    for p in res:
        print(" ->", p["name"], "|", p["currency"], p["price"])

if __name__ == "__main__":
    asyncio.run(main())

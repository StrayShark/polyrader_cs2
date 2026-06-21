import asyncio
from playwright.async_api import async_playwright
import os

async def main():
    html_path = os.path.join(os.path.dirname(__file__), "ui-design.html")
    output_dir = os.path.join(os.path.dirname(__file__), "screenshots")
    os.makedirs(output_dir, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page(viewport={"width": 1440, "height": 900})

        file_url = "file://" + html_path

        themes = [
            ("dark", "Dark (Cursor Dark+)"),
            ("light", "Light (Cursor Light+)"),
            ("matrix", "Matrix (Codex CLI)"),
        ]

        for theme_id, theme_name in themes:
            await page.goto(file_url, wait_until="networkidle")
            # Switch theme
            await page.evaluate(f"switchTheme('{theme_id}')")
            await page.wait_for_timeout(500)

            # Navigate to dashboard first
            await page.evaluate("switchPage('dashboard')")
            await page.wait_for_timeout(300)

            output_path = os.path.join(output_dir, f"ui-{theme_id}-dashboard.png")
            await page.screenshot(path=output_path, full_page=False)
            print(f"Saved: {output_path}")

            # Market detail page
            await page.evaluate("switchPage('market')")
            await page.wait_for_timeout(300)
            output_path = os.path.join(output_dir, f"ui-{theme_id}-market.png")
            await page.screenshot(path=output_path, full_page=False)
            print(f"Saved: {output_path}")

            # Whales page
            await page.evaluate("switchPage('whales')")
            await page.wait_for_timeout(300)
            output_path = os.path.join(output_dir, f"ui-{theme_id}-whales.png")
            await page.screenshot(path=output_path, full_page=False)
            print(f"Saved: {output_path}")

            # Signals page
            await page.evaluate("switchPage('signals')")
            await page.wait_for_timeout(300)
            output_path = os.path.join(output_dir, f"ui-{theme_id}-signals.png")
            await page.screenshot(path=output_path, full_page=False)
            print(f"Saved: {output_path}")

            # Daily dashboard page
            await page.evaluate("switchPage('daily')")
            await page.wait_for_timeout(300)
            output_path = os.path.join(output_dir, f"ui-{theme_id}-daily.png")
            await page.screenshot(path=output_path, full_page=False)
            print(f"Saved: {output_path}")

            # Betting stats page
            await page.evaluate("switchPage('betting')")
            await page.wait_for_timeout(300)
            output_path = os.path.join(output_dir, f"ui-{theme_id}-betting.png")
            await page.screenshot(path=output_path, full_page=False)
            print(f"Saved: {output_path}")

            # LLM Manage page
            await page.evaluate("switchPage('llmManage')")
            await page.wait_for_timeout(300)
            output_path = os.path.join(output_dir, f"ui-{theme_id}-llm-manage.png")
            await page.screenshot(path=output_path, full_page=False)
            print(f"Saved: {output_path}")

            # LLM Analysis page
            await page.evaluate("switchPage('llmAnalysis')")
            await page.wait_for_timeout(300)
            output_path = os.path.join(output_dir, f"ui-{theme_id}-llm-analysis.png")
            await page.screenshot(path=output_path, full_page=False)
            print(f"Saved: {output_path}")

        await browser.close()

    print("\nAll screenshots saved to:", output_dir)

asyncio.run(main())

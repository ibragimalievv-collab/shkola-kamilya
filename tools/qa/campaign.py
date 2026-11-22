"""Run the complete campaign on a fresh browser profile.

Install: python -m pip install playwright && python -m playwright install chromium
Run from the repository root: python tools/qa/campaign.py --report campaign-result.json
"""
import argparse
import json
from contextlib import contextmanager
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
DRIVER = Path(__file__).with_suffix(".js")


@contextmanager
def serve():
    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    handler = partial(Handler, directory=str(ROOT / "app"))
    with ThreadingHTTPServer(("127.0.0.1", 0), handler) as server:
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"http://localhost:{server.server_port}/"
        finally:
            server.shutdown()
            thread.join()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--chromium", help="path to an existing Chromium installation")
    parser.add_argument(
        "--single-process", action="store_true", help="for a single-process headless Chromium shell"
    )
    parser.add_argument("--correct-only", action="store_true", help="expect three stars on every level")
    parser.add_argument("--report", type=Path)
    parser.add_argument("--levels", type=int, help="limit for a local smoke run")
    args = parser.parse_args()
    with serve() as url, sync_playwright() as playwright:
        launch_args = []
        if args.single_process:
            launch_args = ["--single-process", "--no-zygote", "--disable-dev-shm-usage", "--disable-gpu"]
        browser = playwright.chromium.launch(executable_path=args.chromium, args=launch_args)
        context = browser.new_context(viewport={"width": 1280, "height": 900}, service_workers="block")
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))

        # Expose only the generated question. Solutions and progress use the real inputs and store.
        def observe_task(route):
            response = route.fetch()
            body = response.text()
            start = "export function renderTask(t, c) {"
            assert body.count(start) == 1
            route.fulfill(response=response, body=body.replace(start, start + "\n  window.qaTask = t;"))

        page.route("**/js/mechanics.js", observe_task)
        page.route("**/qa/campaign.js", lambda route: route.fulfill(path=DRIVER, content_type="text/javascript"))
        page.goto(url)
        page.get_by_text("Сразу к первому уроку").wait_for()
        def log_progress(message):
            if message.type == "info":
                print(message.text, flush=True)

        page.on("console", log_progress)
        try:
            report = page.evaluate(
                """async ({limit, correctOnly}) => {
                const {runCampaign} = await import('/qa/campaign.js');
                return runCampaign({
                    storage: localStorage,
                    task: () => window.qaTask,
                    limit: limit || undefined,
                    correctOnly,
                    onProgress: ({completed, id}) => {
                        if (completed % 10 === 0) console.info(completed, id);
                    }
                });
                }""",
                {"limit": args.levels, "correctOnly": args.correct_only},
            )
            assert not errors, errors
            state = page.evaluate("localStorage.getItem('shkola-kamilya-v1')")
            page.reload()
            assert page.evaluate("localStorage.getItem('shkola-kamilya-v1')") == state
            report["pageErrors"] = errors
            if args.report:
                args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2))
            summary = {key: report[key] for key in ("wrong", "clicks", "strokes", "retries", "book", "elapsedSeconds")}
            print(json.dumps(summary))
        finally:
            browser.close()


if __name__ == "__main__":
    main()

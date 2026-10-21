/** Opt-in actual TensorFlow browser inference; requires the attributed local image/backbone cache. */
import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import artifact from "../../src/data/scan-test/model.json";
import evaluation from "../../src/data/scan-test/evaluation.json";
const root = path.resolve(".local/object-test");
test.skip(process.env.HAC_OBJECT_SCAN_TESTS !== "1", "Run with HAC_OBJECT_SCAN_TESTS=1 after preparing the documented real-image fixtures.");
test.use({ launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH || "/usr/bin/chromium", args: ["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", `--use-file-for-fake-video-capture=${path.join(root, "camera.y4m")}`] } });
test("real photo inference and live camera frames produce test suggestions and stop on background", async ({ page, context }) => {
  test.setTimeout(120000);
  const products = [{ id: "scan-test-laptop", name: "Laptop — SCAN TEST", itemCode: "SCAN-TEST-LAPTOP", variants: [] }];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("https://storage.googleapis.com/tfjs-models/tfjs/mobilenet_v1_1.0_224/**", async route => {
    const name = path.basename(new URL(route.request().url()).pathname);
    const body = await readFile(path.join(root, "backbone", name));
    await route.fulfill({ status: 200, contentType: name.endsWith("json") ? "application/json" : "application/octet-stream", headers: { "Access-Control-Allow-Origin": "*" }, body });
  });
  await page.route("**/api/v1/**", route => {
    const pathname = new URL(route.request().url()).pathname;
    const data = pathname.endsWith("/auth/me") ? { id: "test-user", name: "Camera Tester", role: "HAC_ADMIN" } : pathname.endsWith("/ai/scan-test") ? { artifact, evaluation, products } : pathname.endsWith("/ai/published") ? null : [];
    return route.fulfill({ json: { data } });
  });
  await page.addInitScript(() => {
    const media = navigator.mediaDevices;
    const original = media.getUserMedia.bind(media);
    (window as any).testCameraTracks = [];
    media.getUserMedia = async constraints => { const stream = await original(constraints); (window as any).testCameraTracks.push(...stream.getTracks()); return stream; };
  });
  await context.grantPermissions(["camera"]);
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/scanner");
  await expect(page.getByRole("heading", { name: "Try the live scanner" })).toBeVisible();
  const fixture = JSON.parse(await readFile(path.join(root, "browser-fixture.json"), "utf8"));
  await page.getByLabel("Upload photo").setInputFiles(path.join(root, fixture.file));
  await expect(page.getByText("Test suggestion — confirm the object yourself", { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole("button", { name: "Select test item", exact: true })).toBeVisible();
  await page.screenshot({ path: ".local/scanner-real-photo-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Start camera", exact: true }).click();
  await expect(page.getByText("Camera on", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.querySelector<HTMLVideoElement>("video")!.videoWidth)).toBeGreaterThan(0);
  // The camera is backed by a real held-out image in a Chromium media stream, not fake predictions.
  await expect(page.getByText("Test suggestion — confirm the object yourself", { exact: true })).toBeVisible({ timeout: 60000 });
  await page.getByRole("button", { name: "Freeze frame", exact: true }).click();
  await expect(page.getByRole("button", { name: "Resume scan", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Resume scan", exact: true }).click();
  await page.evaluate(() => { Object.defineProperty(document, "hidden", { configurable: true, value: true }); document.dispatchEvent(new Event("visibilitychange")); });
  await expect(page.getByText("Camera on", { exact: true })).not.toBeVisible();
  expect(await page.evaluate(() => (window as any).testCameraTracks.every((track: MediaStreamTrack) => track.readyState === "ended"))).toBe(true);
  expect(errors).toEqual([]);
});

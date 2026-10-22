import { test, expect } from "@playwright/test";
test("first mobile visit offers native installation with the circular HAC icon and remembers Later", async ({
  page,
}) => {
  await page.setViewportSize({ width: 393, height: 852 });
  await page.goto("/login");
  const prompt = page.getByRole("dialog", {
    name: "Install HAC app",
    exact: true,
  });
  await expect(prompt).toBeVisible();
  await expect(
    prompt.getByRole("img", { name: "HAC halal app icon" }),
  ).toHaveAttribute("src", "/branding/hac-original-v4-192.png");
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt");
    Object.assign(event, {
      prompt: async () => {
        (window as any).installCalled = true;
      },
      userChoice: Promise.resolve({ outcome: "dismissed" }),
    });
    window.dispatchEvent(event);
  });
  await prompt
    .getByRole("button", { name: "Install app", exact: true })
    .click();
  await expect(prompt).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).installCalled)).toBe(true);
  await page.reload();
  await page.waitForTimeout(1500);
  await expect(prompt).toHaveCount(0);
  const manifest = await (
    await page.request.get("/manifest.webmanifest")
  ).json();
  expect(manifest.icons.map((icon: any) => icon.sizes)).toEqual([
    "192x192",
    "512x512",
  ]);
});

import "dotenv/config";
const url = new URL(process.env.DATABASE_URL || "");
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) ||
  Number(url.port || 3306) !== 3307 ||
  url.pathname !== "/hac_dev" ||
  process.env.DEMO_MODE !== "true"
)
  throw new Error(
    "Automatic development setup only permits DEMO_MODE=true and localhost:3307/hac_dev. Review other targets separately; do not migrate or seed them automatically.",
  );
console.log("Confirmed isolated local demonstration database target.");

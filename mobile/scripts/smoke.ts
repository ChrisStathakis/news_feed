import { runEditionDemo } from "../src/lib/runDemo";

runEditionDemo((message, percent) => console.log(`${percent}% ${message}`))
  .then((result) => {
    console.log(
      `\nRAW ${result.rawCount} · ITEMS ${result.items.length} · PAGES ${result.edition.pages.length}`,
    );
    console.log("LEAD:", result.edition.lead?.title ?? "—");
    console.log(
      "PAGE KEYS:",
      result.edition.pages.map((page) => `${page.num}:${page.key}/${page.kind}`).join(", "),
    );
    for (const entry of result.report) {
      console.log(`${entry.source}: ${entry.count} (${entry.method})`);
    }
  })
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

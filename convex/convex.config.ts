import { defineApp } from "convex/server";
import aggregate from "@convex-dev/aggregate/convex.config";

const app = defineApp();
app.use(aggregate, { name: "paragraphsByWordCount" });
app.use(aggregate, { name: "playerStats" });

export default app;
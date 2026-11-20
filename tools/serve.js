import express from "express";
import { build, publicDir } from "./build.js";

await build();
const app = express();
app.get("/health", (_request, response) =>
  response.json({ status: "healthy" }),
);
app.get(["/picker", "/dashboard", "/unified"], (_request, response) =>
  response.redirect("/"),
);
app.use(express.static(publicDir));
app.use((_request, response) => response.status(404).send("Page not found."));
const port = Number(process.env.PORT || 3000);
app.listen(port, process.env.HOST || "127.0.0.1", () =>
  console.log(`Certificate Generator: http://localhost:${port}`),
);

import { defineConfig } from "astro/config";
import { BASE_PATH, CUSTOM_DOMAIN } from "./src/server-constants";

const getSite = function () {
    if (CUSTOM_DOMAIN) {
        return new URL(BASE_PATH, `https://${CUSTOM_DOMAIN}`).toString();
    }

    if (process.env.CF_PAGES) {
        if (process.env.CF_PAGES_BRANCH !== "main") {
            return new URL(BASE_PATH, process.env.CF_PAGES_URL).toString();
        }

        return new URL(
            BASE_PATH,
            `https://${process.env.CF_PAGES_URL ? new URL(process.env.CF_PAGES_URL).host.split(".").slice(1).join(".") : ""}`,
        ).toString();
    }

    return new URL(BASE_PATH, "http://localhost:4321").toString();
};

export default defineConfig({
    site: getSite(),
    base: BASE_PATH,
});

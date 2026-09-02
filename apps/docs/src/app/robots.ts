import { COMPANY } from "@choros/shared/constants";
import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
	return {
		rules: [
			{
				userAgent: "*",
				allow: "/",
				disallow: ["/api/", "/_next/", "/llms.mdx/", "/llms-full.txt"],
			},
		],
		sitemap: `${COMPANY.DOCS_URL}/sitemap.xml`,
	};
}

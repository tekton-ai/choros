import { useEffect } from "react";
import { productName } from "~/package.json";

export function WindowTitle() {
	useEffect(() => {
		document.title = productName;
	}, []);
	return null;
}

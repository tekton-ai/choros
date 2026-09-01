// File generated from our OpenAPI spec by Stainless. See CONTRIBUTING.md for details.

import type { Choros } from "../client";

export abstract class APIResource {
	protected _client: Choros;

	constructor(client: Choros) {
		this._client = client;
	}
}

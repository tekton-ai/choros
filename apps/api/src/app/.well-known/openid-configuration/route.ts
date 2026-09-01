import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { auth } from "@choros/auth/server";

export const GET = oauthProviderOpenIdConfigMetadata(auth);

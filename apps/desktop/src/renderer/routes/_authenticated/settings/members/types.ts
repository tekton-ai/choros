import type { OrganizationRole } from "@choros/shared/auth";

export type TeamMember = {
	memberId: string;
	userId: string;
	organizationId: string;
	role: OrganizationRole;
	createdAt: Date;
	name: string;
	email: string;
	image: string | null;
	deletionRequestedAt: Date | null;
};

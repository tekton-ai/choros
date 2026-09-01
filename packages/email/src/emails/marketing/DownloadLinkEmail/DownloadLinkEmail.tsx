import { Heading, Section, Text } from "@react-email/components";
import { Button, EmailLayout } from "../../../components";

const DOWNLOAD_URL =
	"https://choros.sh/download?utm_source=email&utm_medium=transactional&utm_campaign=mobile-download-link";

interface DownloadLinkEmailProps {
	recipientEmail?: string;
}

export function DownloadLinkEmail({
	recipientEmail,
}: DownloadLinkEmailProps = {}) {
	return (
		<EmailLayout
			preview="Your Choros desktop download link"
			recipientEmail={recipientEmail}
		>
			<Heading className="m-0 mb-3 text-[22px] font-medium leading-8 text-foreground">
				Get Choros on your Mac
			</Heading>
			<Text className="m-0 mb-6 text-[15px] leading-6 text-muted">
				Open this email on your Mac, then use the button below to download
				Choros. The right version will be selected automatically.
			</Text>

			<Section className="mb-8">
				<Button href={DOWNLOAD_URL}>Download Choros</Button>
			</Section>

			<Text className="m-0 text-[13px] leading-5 text-muted">
				Choros is available for macOS today. Windows and Linux support is on
				the way.
			</Text>
		</EmailLayout>
	);
}

export default DownloadLinkEmail;

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@choros/ui/select";
import { useLingui } from "@lingui/react/macro";
import { useProfiles } from "renderer/routes/_authenticated/providers/profile-provider";

export function ProfileDestinationSelect({
	value,
	onChange,
	disabled,
	label,
}: {
	value: string;
	onChange: (id: string) => void;
	disabled?: boolean;
	label?: string;
}) {
	const { t } = useLingui();
	const { profiles } = useProfiles();
	return (
		<Select value={value} onValueChange={onChange} disabled={disabled}>
			<SelectTrigger
				size="sm"
				className="w-40 min-w-0 shrink-0"
				aria-label={
					label ??
					t({
						id: "profiles.manager.destination",
						message: "Destination Profile",
					})
				}
			>
				<SelectValue
					placeholder={t({
						id: "profiles.manager.chooseDestination",
						message: "Choose Profile",
					})}
				/>
			</SelectTrigger>
			<SelectContent>
				{profiles.map((profile) => (
					<SelectItem key={profile.id} value={profile.id} title={profile.name}>
						<span className="block max-w-64 truncate">{profile.name}</span>
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}

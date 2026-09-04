const ONBOARDING_COMPLETE_KEY = "choros:onboarding-complete-v1";

export function isOnboardingComplete(): boolean {
	return window.localStorage.getItem(ONBOARDING_COMPLETE_KEY) === "1";
}

export function markOnboardingComplete(): void {
	window.localStorage.setItem(ONBOARDING_COMPLETE_KEY, "1");
}

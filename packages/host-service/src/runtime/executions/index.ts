export { createNativeExecutionDriver } from "./native-driver";
export type {
	ExecutablePermissionDecision,
	PermissionOption,
} from "./permission-answer";
export {
	executablePermissionOptions,
	InvalidPermissionAnswerError,
	validatePermissionAnswer,
} from "./permission-answer";
export {
	createExecutionPreparer,
	createPreparedExecutionRestorer,
	resolveAutomationDefinition,
} from "./prepare-execution";
export type {
	AutomationRuntimeOptions,
	ExecutionDriver,
	ExecutionDriverEvent,
	ExecutionDriverHandle,
	ExecutionDriverRequest,
	ExecutionInspection,
	PreparationRequest,
	PreparedExecution,
	PreparedExecutionSnapshot,
	RestorePreparationRequest,
} from "./types";
export { ExecutionPreparationError } from "./types";

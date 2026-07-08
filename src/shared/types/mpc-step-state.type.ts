import { MPCPhase } from "../services/mpc.service";
import { StepStatus } from "../enums/step-status.enum";

export interface MPCStepState {
  phase: MPCPhase;
  label: string;
  status: StepStatus;
  message: string;
  progress: number;
  subMessage: string;
  error?: string;
  retryable: boolean;
  completedAt?: number;
  durationMs?: number;
}

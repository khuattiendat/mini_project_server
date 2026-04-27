export interface UserAttemptDto {
  id: number;
  examId: number;
  examTitle: string;
  attemptNo: number;
  status: string;
  startedAt: Date | null;
  submittedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
}

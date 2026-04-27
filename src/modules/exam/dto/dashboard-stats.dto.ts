export interface DashboardStatsDto {
  overview: {
    totalUsers: number;
    totalExams: number;
    totalQuestions: number;
    totalAttempts: number;
  };
  attemptsByStatus: Array<{
    status: string;
    count: number;
  }>;
  topExams: Array<{
    examId: number;
    examTitle: string;
    attemptCount: number;
  }>;
  attemptsTimeline: Array<{
    date: string;
    count: number;
  }>;
  violations: {
    totalViolations: number;
    byType: Array<{
      type: string;
      count: number;
    }>;
  };
}

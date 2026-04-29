import { HttpException, HttpStatus } from '@nestjs/common';

export class AttemptAlreadySubmittedException extends HttpException {
  constructor() {
    super(
      'Bài thi này đã được nộp rồi. Bạn không thể nộp lại bài thi này nữa',
      HttpStatus.FORBIDDEN,
    );
  }
}

export class AttemptViolatedException extends HttpException {
  constructor() {
    super(
      'Bạn đã vi phạm quy chế thi với đề thi này. Vui lòng liên hệ với giám thị để biết thêm chi tiết',
      HttpStatus.FORBIDDEN,
    );
  }
}

export class AttemptTerminatedException extends HttpException {
  constructor() {
    super(
      'Bài thi này đã bị kết thúc. Bạn không thể tiếp tục làm bài thi nữa. Vui lòng liên hệ với giám thị để biết thêm chi tiết',
      HttpStatus.FORBIDDEN,
    );
  }
}

export class ExamNotAvailableException extends HttpException {
  constructor() {
    super(
      'Bài thi không tồn tại hoặc chưa đến thời gian làm bài. Vui lòng kiểm tra lại',
      HttpStatus.FORBIDDEN,
    );
  }
}

export class SubmitConflictException extends HttpException {
  constructor() {
    super(
      'Bài thi đang được xử lý, vui lòng chờ!',
      HttpStatus.CONFLICT,
    );
  }
}


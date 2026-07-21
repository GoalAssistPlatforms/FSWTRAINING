export class PlaybackSequenceInvalidError extends Error {
  constructor(message: string, public override cause?: any) {
    super(message);
    this.name = "PlaybackSequenceInvalidError";
  }
}

export class PlaybackSourceMismatchError extends Error {
  constructor(message: string, public override cause?: any) {
    super(message);
    this.name = "PlaybackSourceMismatchError";
  }
}

export class PlaybackMediaUnavailableError extends Error {
  constructor(message: string, public override cause?: any) {
    super(message);
    this.name = "PlaybackMediaUnavailableError";
  }
}

export class PlaybackSeekError extends Error {
  constructor(message: string, public override cause?: any) {
    super(message);
    this.name = "PlaybackSeekError";
  }
}

export class PlaybackTransitionError extends Error {
  constructor(message: string, public override cause?: any) {
    super(message);
    this.name = "PlaybackTransitionError";
  }
}

export class PlaybackDisposedError extends Error {
  constructor(message: string, public override cause?: any) {
    super(message);
    this.name = "PlaybackDisposedError";
  }
}

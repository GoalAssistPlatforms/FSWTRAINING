// Each piece is one Whisper request and one function invocation. Pieces overlap by a second and
// are stitched with midpoint ownership so words on a boundary are not lost or duplicated.
// Pure constants only: this module is imported by workflow code, which must stay free of Node APIs.
export const CHUNK_SECONDS = 900;
export const CHUNK_OVERLAP_SECONDS = 1;

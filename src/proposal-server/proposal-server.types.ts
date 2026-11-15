export type ProposalSendResult =
  | { status: 'accepted' }
  | { status: 'disabled' }
  | { status: 'failed'; reason: string };

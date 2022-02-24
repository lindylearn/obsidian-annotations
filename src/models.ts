export type Article = {
  id: string;
  metadata: Metadata;
  highlights: Highlights[];
  page_note: Highlights;
};

export type Metadata = {
  author: string;
  title: string;
  url: string;
  lastAccessedDate?: string;
};

export type Highlights = {
  id?: string;
  created: string;
  updated: string;
  text: string;
  incontext: string;
  user: string;
  annotation: string;
  tags: string[];
  group: string;
  isReply: boolean;
  remote_state?: RemoteState;
};

export enum RemoteState {
  SYNCHRONIZED,
  LOCAL_ONLY,
  REMOTE_ONLY,
  UPDATED_LOCAL,
  UPDATED_REMOTE,
  // CONFLICT,
}

export type LocalArticle = {
  id: string;
  highlights: LocalHighlight[];
  page_note: LocalHighlight;
  updated_millis: number;
}

export type LocalHighlight = {
  id?: string;
  // updated: string;
  text: string;
  annotation: string;
  tags: string[];
  remote_state?: RemoteState;
}

export type RenderTemplate = {
  title: string;
  author: string;
  url: string;
  highlights: Highlights[];
  page_note: Highlights;
  annotation_dates: string[];
};

export type Group = {
  id: string;
  name: string;
  type: string;
  public: boolean;
  selected: boolean;
};

export type SyncedFile = {
  filename: string,
  uri: string
}

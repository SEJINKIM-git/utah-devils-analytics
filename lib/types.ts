export type Player = {
  id: string;
  name: string;
  position?: string | null;
  ops?: number | null;
  obp?: number | null;
  slg?: number | null;
};

export type Game = {
  id: string;
  date: string;
  opponent: string;
  location?: string | null;
  home_away?: "H" | "A" | null;
  our_score?: number | null;
  opp_score?: number | null;
};
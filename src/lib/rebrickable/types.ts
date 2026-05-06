export type RebrickableSet = {
  set_num: string;
  name: string;
  year?: number;
  theme_id?: number;
  num_parts?: number;
  set_img_url?: string | null;
  set_url?: string | null;
};

export type RebrickablePart = {
  part_num: string;
  name: string;
  part_cat_id?: number;
  part_url?: string | null;
  part_img_url?: string | null;
};

export type RebrickablePartCategory = {
  id: number;
  name: string;
};

export type RebrickableColor = {
  id: number;
  name: string;
  rgb?: string;
  is_trans?: boolean;
};

export type RebrickablePartColor = {
  color_id: number;
  color_name: string;
  num_sets?: number;
  part_img_url?: string | null;
  elements?: string[];
};

export type RebrickableInventoryPart = {
  id?: number;
  inv_part_id?: number;
  part: RebrickablePart;
  color: RebrickableColor;
  quantity: number;
  is_spare: boolean;
  element_id?: string | null;
};

export type RebrickableAlternate = {
  moc_id?: number;
  set_num?: string;
  name: string;
  designer_name?: string;
  num_parts?: number;
  moc_img_url?: string | null;
  moc_url?: string | null;
};

export type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type Trip = {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  /** ヘッダーの色(#rrggbb)。null・未設定は初期色 */
  header_color?: string | null;
  /** ヘッダーの文字の色(#rrggbb)。null・未設定は初期色 */
  header_text_color?: string | null;
};
import type { TravelMode } from "@/lib/trip-utils";
import type { StationLookup } from "@/lib/stations";

type LatLng = { lat: number; lng: number };

/** 2点間の直線距離(km) */
export function haversineDistanceKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export type TravelEstimate = {
  /** 所要時間(分) */
  minutes: number;
  /** 費用(円)。徒歩は0 */
  fareYen: number;
  /** 道のり(km)。直線距離から推定した値 */
  distanceKm: number;
  /** 金額の算出根拠(画面表示用) */
  basis: string;
};

/**
 * 直線距離 → 実際の道のり(線路・道路は直線より長く曲がる)への補正係数。
 * 鉄道は実際の営業キロ(東京→横浜 直線27km:営業29km、東京→名古屋 直線268km:営業366km など)から調整。
 */
function routeKm(straightKm: number, mode: TravelMode): number {
  if (mode === "transit") {
    if (straightKm <= 10) return straightKm * 1.4; // 市街地は迂回が多い
    if (straightKm <= 50) return straightKm * 1.05;
    if (straightKm <= 150) return straightKm * 1.15;
    if (straightKm <= 250) return straightKm * 1.25;
    return straightKm * 1.38; // 長距離は山地・海峡の迂回が増える
  }
  return straightKm * (straightKm > 100 ? 1.25 : 1.3); // 徒歩・車(道路)
}

/**
 * JR東日本「幹線」の普通運賃表(2026年3月14日改定後)。 [営業キロの上限, 運賃]
 * 出典: JR東日本の運賃表。私鉄・地方交通線・東京の電車特定区間などでは異なる。
 */
const JR_FARE_TABLE: Array<[number, number]> = [
  [3, 160], [6, 200], [10, 210], [15, 260], [20, 350], [25, 440], [30, 530],
  [35, 620], [40, 720], [45, 810], [50, 910], [60, 1040], [70, 1230], [80, 1410],
  [90, 1600], [100, 1790], [120, 2090], [140, 2420], [160, 2750], [180, 3190],
  [200, 3520], [220, 3850], [240, 4180], [260, 4620], [280, 5060], [300, 5390],
  [320, 5720], [340, 5940], [360, 6270], [380, 6600], [400, 6930], [420, 7260],
  [440, 7480], [460, 7810], [480, 8030], [500, 8360], [520, 8690], [540, 9020],
  [560, 9350], [580, 9570], [600, 9900], [640, 10230], [680, 10450], [720, 10780],
  [760, 11110], [800, 11440], [840, 11770], [880, 11990], [920, 12320], [960, 12650],
  [1000, 12980], [1040, 13310], [1080, 13640], [1120, 13860], [1160, 14190],
  [1200, 14520], [1240, 14850], [1280, 15180], [1320, 15510], [1360, 15730],
  [1400, 16060], [1440, 16390], [1480, 16720], [1520, 17050], [1560, 17270],
];

function jrBaseFare(km: number): number {
  const kmInt = Math.ceil(km); // 営業キロは切り上げの整数km
  const found = JR_FARE_TABLE.find(([max]) => kmInt <= max);
  if (found) return found[1];
  // 表の範囲(1,560km)を超える場合は、40kmごとに約330円ずつ加算して外挿
  const last = JR_FARE_TABLE[JR_FARE_TABLE.length - 1];
  return last[1] + Math.ceil((kmInt - last[0]) / 40) * 330;
}

/**
 * 新幹線・特急の料金の目安。[営業キロ, 料金]
 * 東海道・東北新幹線などの通常期・指定席の実際の運賃から逆算した概算。
 * (東京→名古屋11,300円、仙台11,410円、新大阪14,720円、博多23,810円 など)
 * 100km未満は普通列車を想定して0円。
 */
const EXPRESS_POINTS: Array<[number, number]> = [
  [100, 2000],
  [350, 5000],
  [550, 5800],
  [1175, 9700],
  [2000, 12500],
];

function expressSurcharge(km: number): number {
  if (km < 100) return 0;
  const last = EXPRESS_POINTS[EXPRESS_POINTS.length - 1];
  if (km >= last[0]) return last[1];
  for (let i = 0; i < EXPRESS_POINTS.length - 1; i++) {
    const [x1, y1] = EXPRESS_POINTS[i];
    const [x2, y2] = EXPRESS_POINTS[i + 1];
    if (km >= x1 && km <= x2) {
      return Math.round(y1 + ((y2 - y1) * (km - x1)) / (x2 - x1));
    }
  }
  return 0;
}

const round10 = (n: number) => Math.round(n / 10) * 10;

/**
 * 直線距離をもとに、移動時間と費用の「目安」を計算する。
 * 実際の経路検索・運賃検索を行うものではなく、あくまで概算。
 */
export function estimateTravel(straightKm: number, mode: TravelMode): TravelEstimate {
  const km = routeKm(straightKm, mode);

  if (mode === "walking") {
    return {
      minutes: Math.round((km / 4.8) * 60),
      fareYen: 0,
      distanceKm: km,
      basis: km > 15 ? "時速4.8kmで換算(かなりの長時間・長距離です)" : "時速4.8kmで換算",
    };
  }

  if (mode === "bus") {
    // バスは路線の有無・実際の運賃を無料では調べられないため、距離からの目安だけを出す
    if (km <= 30) {
      // 市内の路線バス: 初乗り210円 + 3km超は1kmあたり約28円。停車・信号待ちを含め平均時速16km
      return {
        minutes: Math.round((km / 16) * 60) + 8,
        fareYen: round10(210 + Math.max(km - 3, 0) * 28),
        distanceKm: km,
        basis: "路線バス(距離制運賃)の目安・路線の有無は未確認",
      };
    }
    // 長距離は高速バスを想定: 1kmあたり約13円 + 300円、平均時速60km + 乗降20分
    return {
      minutes: Math.round(km) + 20,
      fareYen: round10(km * 13 + 300),
      distanceKm: km,
      basis: "高速バス料金の目安・路線の有無は未確認",
    };
  }

  if (mode === "taxi" || mode === "rental" || mode === "car" || mode === "driving") {
    // 以前の「車」(driving)は、近ければタクシー・遠ければ自家用車として扱う
    const kind = mode === "driving" ? (km <= 30 ? "taxi" : "car") : mode;

    const speed = km <= 10 ? 20 : km <= 40 ? 35 : 65; // 市街地→一般道→高速の平均速度
    const breaks = Math.floor(km / 150) * 15; // 長距離は150kmごとに15分休憩
    const minutes = Math.round((km / speed) * 60) + 5 + breaks;

    if (kind === "taxi") {
      // 東京23区の料金体系: 初乗り1.096kmで500円、以降255mごとに100円
      const extraKm = Math.max(km - 1.096, 0);
      const fareYen = round10(500 + (extraKm * 1000 * 100) / 255);
      return {
        minutes,
        fareYen,
        distanceKm: km,
        basis: km > 100 ? "タクシー料金で換算(長距離は非現実的な金額です)" : "タクシー料金(東京23区の料金体系)で換算",
      };
    }

    // 自家用車・レンタカー: ガソリン代(燃費12km/L・175円/L) + 高速代(30km以上は走行の8割が高速と仮定、約24.6円/km)
    const fuel = (km / 12) * 175;
    const toll = km >= 30 ? km * 0.8 * 24.6 + 150 : 0;
    return {
      minutes,
      fareYen: round10(fuel + toll),
      distanceKm: km,
      basis:
        kind === "rental"
          ? "ガソリン代+高速代の目安(レンタル基本料金・補償料・駐車場代は別途)"
          : "ガソリン代+高速代の目安(駐車場代は含みません)",
    };
  }

  // transit(電車・バス): 距離が伸びるほど快速・特急・新幹線の比率が増えるため、平均速度を連続的に上げる
  let minutes: number;
  if (km <= 15) {
    minutes = Math.round((km / 30) * 60) + 10;
  } else if (km <= 100) {
    const speed = 45 + ((km - 15) * 60) / 85; // 45→105km/h
    const overhead = 10 + ((km - 15) * 15) / 85; // 待ち時間・乗換 10→25分
    minutes = Math.round((km / speed) * 60 + overhead);
  } else {
    const speed = Math.min(170, 105 + (km - 100) * 0.25); // 新幹線主体で最大170km/h
    const overhead = 25 + Math.min(25, (km - 100) / 16); // 25→50分
    minutes = Math.round((km / speed) * 60 + overhead);
  }

  const base = jrBaseFare(km);
  const surcharge = expressSurcharge(km);
  return {
    minutes,
    fareYen: base + surcharge,
    distanceKm: km,
    basis:
      surcharge > 0
        ? "JR運賃+新幹線・特急料金の目安"
        : "JR東日本の幹線運賃をもとにした目安",
  };
}

/** 分 → 「1時間30分」のような表示 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}分`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}


/** 「札幌」→「札幌駅」のように、表示用に「駅」を付ける */
function stationLabel(name: string): string {
  return name.endsWith("駅") ? name : `${name}駅`;
}

export type TransitPlan =
  | { status: "ok"; estimate: TravelEstimate; detail: string; walkingFaster?: string }
  | { status: "unavailable"; kind: "error" | "none" | "same"; reason: string }
  | { status: "pending" };

/**
 * 電車での移動を「最寄り駅まで歩く → 駅間を乗車 → 駅から歩く」で見積もる。
 * 近くに駅が無い、または出発地と目的地の最寄り駅が同じ場合は「電車は使えない」を返す。
 */
export function planTransit(
  stationA: StationLookup | undefined,
  stationB: StationLookup | undefined,
  straightKm: number
): TransitPlan {
  if (!stationA || !stationB) return { status: "pending" };

  if (stationA.status === "error" || stationB.status === "error") {
    return {
      status: "unavailable",
      kind: "error",
      reason: "最寄り駅の情報を取得できませんでした(通信エラー)",
    };
  }
  if (stationA.status === "none" || stationB.status === "none") {
    const where = stationA.status === "none" ? "出発地" : "目的地";
    return {
      status: "unavailable",
      kind: "none",
      reason: `${where}の近く(1.5km以内)に駅がないため、電車は使えません`,
    };
  }

  const stationKm = haversineDistanceKm(stationA, stationB);
  if (stationA.name === stationB.name || stationKm < 0.3) {
    return {
      status: "unavailable",
      kind: "same",
      reason: `最寄り駅が同じ(${stationLabel(stationA.name)})のため、電車は使えません`,
    };
  }

  const ride = estimateTravel(stationKm, "transit");
  const walkMin = (km: number) => Math.round(((km * 1.3) / 4.8) * 60);
  const accessA = walkMin(stationA.distanceKm);
  const accessB = walkMin(stationB.distanceKm);

  const totalMinutes = ride.minutes + accessA + accessB;

  // 歩いた方が早い距離でも、利用者が電車を選べるよう見積もり自体は返し、注意書きだけ付ける
  const walkingMinutes = Math.round(((straightKm * 1.3) / 4.8) * 60);
  const walkingFaster =
    totalMinutes >= walkingMinutes
      ? `徒歩(約${walkingMinutes}分)の方が早い距離です`
      : undefined;

  return {
    status: "ok",
    estimate: { ...ride, minutes: totalMinutes },
    walkingFaster,
    detail: `${stationLabel(stationA.name)}(徒歩約${accessA}分)→ ${stationLabel(
      stationB.name
    )}(徒歩約${accessB}分)`,
  };
}


/**
 * 保存されている手段を、画面のボタンに対応する手段にそろえる。
 * 以前の「車(driving)」は、近ければタクシー・遠ければ自家用車として扱う。
 */
export function normalizeMode(mode: TravelMode, straightKm: number): TravelMode {
  if (mode !== "driving") return mode;
  return straightKm * 1.3 <= 30 ? "taxi" : "car";
}

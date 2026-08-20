"use client";

const HOURS_0_TO_24 = [
  "00",
  "01",
  "02",
  "03",
  "04",
  "05",
  "06",
  "07",
  "08",
  "09",
  "10",
  "11",
  "12",
  "13",
  "14",
  "15",
  "16",
  "17",
  "18",
  "19",
  "20",
  "21",
  "22",
  "23",
  "24",
] as const;

const MINS = ["00", "10", "20", "30", "40", "50"] as const;

type LeaveBounds = { minStart?: string; maxEnd?: string };

type Props = {
  value: string;
  onChange: (v: string) => void;
  leaveBounds?: LeaveBounds;
  /** end는 24:00까지 선택 가능 */
  role?: "start" | "end";
};

export function TimeSelect({
  value,
  onChange,
  leaveBounds = {},
  role = "end",
}: Props) {
  const [h, m] = (value || "00:00").split(":");
  const minT = leaveBounds.minStart;
  const maxT = leaveBounds.maxEnd;
  const minH = minT ? Number(minT.slice(0, 2)) : 0;
  const defaultMax = role === "start" ? 23 : 24;
  const maxH = maxT ? Number(maxT.slice(0, 2)) : defaultMax;
  const minM = minT ? Number(minT.slice(3, 5)) : 0;
  const maxM = maxT
    ? Number(maxT.slice(3, 5))
    : maxH === 24
      ? 0
      : 50;

  const hoursOptions = HOURS_0_TO_24.filter((x) => {
    const n = Number(x);
    return n >= minH && n <= maxH;
  });

  const hourNum = Number(
    hoursOptions.includes(h as (typeof HOURS_0_TO_24)[number])
      ? h
      : hoursOptions[hoursOptions.length - 1] || "0"
  );

  const minOptions = MINS.filter((x) => {
    const n = Number(x);
    if (hourNum === 24) return n === 0;
    if (hourNum === minH && n < minM) return false;
    if (hourNum === maxH && n > maxM) return false;
    return true;
  });

  const hourValue = String(hourNum).padStart(2, "0");
  const minValue = minOptions.includes(m as (typeof MINS)[number])
    ? m
    : minOptions[0] || "00";

  return (
    <>
      <select
        className="time-h"
        value={hourValue}
        aria-label={role === "start" ? "시작 시" : "종료 시"}
        onChange={(e) => {
          const nh = e.target.value;
          let nm = minValue;
          const hour = Number(nh);
          if (hour === 24) nm = "00";
          else {
            if (hour === minH && Number(nm) < minM)
              nm = String(minM).padStart(2, "0");
            if (hour === maxH && Number(nm) > maxM)
              nm = String(maxM).padStart(2, "0");
          }
          onChange(`${nh}:${nm}`);
        }}
      >
        {hoursOptions.map((x) => (
          <option key={x} value={x}>
            {Number(x)}시
          </option>
        ))}
      </select>
      <span className="colon">:</span>
      <select
        className="time-m"
        value={minValue}
        aria-label={role === "start" ? "시작 분" : "종료 분"}
        onChange={(e) => onChange(`${hourValue}:${e.target.value}`)}
      >
        {minOptions.map((x) => (
          <option key={x} value={x}>
            {x}분
          </option>
        ))}
      </select>
    </>
  );
}

import React from "react";
import Svg, {Circle, Path, Rect} from "react-native-svg";

// Line icons in the Lucide style (24×24 grid, round caps), drawn with react-native-svg.
type Shape =
    | {d: string}
    | {cx: number; cy: number; r: number}
    | {x: number; y: number; width: number; height: number; rx?: number};

const ICONS = {
    home: [{d: "m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"}],
    scan: [
        {d: "M3 7V5a2 2 0 0 1 2-2h2"}, {d: "M17 3h2a2 2 0 0 1 2 2v2"}, {d: "M21 17v2a2 2 0 0 1-2 2h-2"},
        {d: "M7 21H5a2 2 0 0 1-2-2v-2"}, {d: "M7 8v8"}, {d: "M11 8v8"}, {d: "M15 8v8"}, {d: "M18 8v8"},
    ],
    scanLine: [
        {d: "M3 7V5a2 2 0 0 1 2-2h2"}, {d: "M17 3h2a2 2 0 0 1 2 2v2"}, {d: "M21 17v2a2 2 0 0 1-2 2h-2"},
        {d: "M7 21H5a2 2 0 0 1-2-2v-2"}, {d: "M8 12h8"},
    ],
    search: [{cx: 11, cy: 11, r: 7}, {d: "m20 20-3.5-3.5"}],
    history: [{cx: 12, cy: 12, r: 9}, {d: "M12 7v5l3 2"}],
    settings: [
        {d: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"},
        {cx: 12, cy: 12, r: 3},
    ],
    device: [{x: 6, y: 2, width: 12, height: 20, rx: 2}, {d: "M11 18h2"}],
    logout: [{d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"}, {d: "m16 17 5-5-5-5"}, {d: "M21 12H9"}],
    back: [{d: "m15 18-6-6 6-6"}],
    chevronRight: [{d: "m9 18 6-6-6-6"}],
    arrowRight: [{d: "M5 12h14"}, {d: "m13 6 6 6-6 6"}],
    check: [{d: "M20 6 9 17l-5-5"}],
    close: [{d: "M18 6 6 18"}, {d: "m6 6 12 12"}],
    trash: [{d: "M3 6h18"}, {d: "M8 6V4h8v2"}, {d: "M19 6l-1 14H6L5 6"}],
    alert: [{cx: 12, cy: 12, r: 9}, {d: "M12 8v5"}, {d: "M12 16h.01"}],
    info: [{cx: 12, cy: 12, r: 9}, {d: "M12 16v-4"}, {d: "M12 8h.01"}],
    wifiOff: [
        {d: "M12 20h.01"}, {d: "M8.5 16.4a5 5 0 0 1 7 0"}, {d: "M2 8.8a15 15 0 0 1 4.2-2.6"},
        {d: "M22 8.8a15 15 0 0 0-11.3-3.6"}, {d: "M5 12.9a10 10 0 0 1 5.2-2.7"}, {d: "M19 12.9a10 10 0 0 0-2.3-1.6"}, {d: "m2 2 20 20"},
    ],
    refresh: [{d: "M21 12a9 9 0 0 1-15.5 6.2L3 16"}, {d: "M3 21v-5h5"}, {d: "M3 12a9 9 0 0 1 15.5-6.2L21 8"}, {d: "M21 3v5h-5"}],
    flashlight: [{d: "M18 6c0 2-2 2-2 4v10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2V10c0-2-2-2-2-4V2h12z"}, {d: "M6 6h12"}, {d: "M12 12v2"}],
    camera: [{d: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"}, {cx: 12, cy: 13, r: 3}],
    keyboard: [{x: 2, y: 6, width: 20, height: 12, rx: 2}, {d: "M6 10h.01M10 10h.01M14 10h.01M18 10h.01M8 14h8"}],
    collect: [{d: "M12 3v12"}, {d: "m7 10 5 5 5-5"}, {d: "M5 21h14"}],
    handover: [{d: "M3 17c3-3 5-8 7-8s-1 8 2 8 3-4 5-4 1 4 4 4"}, {d: "M3 21h18"}],
    pallet: [{x: 3, y: 14, width: 18, height: 6, rx: 1}, {x: 5, y: 4, width: 6, height: 10, rx: 1}, {x: 13, y: 7, width: 6, height: 7, rx: 1}],
    return: [{d: "M9 14 4 9l5-5"}, {d: "M4 9h11a5 5 0 0 1 0 10h-3"}],
    reject: [{cx: 12, cy: 12, r: 9}, {d: "m5.7 5.7 12.6 12.6"}],
    door: [{d: "M13 4h3a2 2 0 0 1 2 2v14"}, {d: "M2 20h3"}, {d: "M13 20h9"}, {d: "M10 12v.01"}, {d: "M13 4.56v16.16a.5.5 0 0 1-.63.48L5 19V5.56a2 2 0 0 1 1.5-1.94l4-1A2 2 0 0 1 13 4.56Z"}],
    phone: [{d: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"}],
    navigate: [{d: "m3 11 19-9-9 19-2-8Z"}],
    mail: [{x: 2, y: 4, width: 20, height: 16, rx: 2}, {d: "m22 7-10 6L2 7"}],
    mapPin: [{d: "M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"}, {cx: 12, cy: 10, r: 3}],
    package: [{d: "M21 8 12 3 3 8v8l9 5 9-5Z"}, {d: "M3 8l9 5 9-5"}, {d: "M12 13v8"}],
    user: [{cx: 12, cy: 8, r: 4}, {d: "M4 21a8 8 0 0 1 16 0"}],
    lock: [{x: 4, y: 11, width: 16, height: 10, rx: 2}, {d: "M8 11V7a4 4 0 0 1 8 0v4"}],
    clock: [{cx: 12, cy: 12, r: 9}, {d: "M12 7v5l3 2"}],
    upload: [{d: "M12 15V3"}, {d: "m7 8 5-5 5 5"}, {d: "M5 21h14"}],
    truck: [
        {d: "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"}, {d: "M15 18H9"},
        {d: "M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.62l-3.48-4.35A1 1 0 0 0 17.52 8H14"}, {cx: 17, cy: 18, r: 2}, {cx: 7, cy: 18, r: 2},
    ],
    message: [{d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"}],
    list: [{d: "M8 6h13"}, {d: "M8 12h13"}, {d: "M8 18h13"}, {d: "M3 6h.01"}, {d: "M3 12h.01"}, {d: "M3 18h.01"}],
} satisfies Record<string, Shape[]>;

export type IconName = keyof typeof ICONS;

type Props = {
    name: IconName;
    size?: number;
    color?: string;
    strokeWidth?: number;
};

export function Icon({name, size = 22, color = "#F1F5F9", strokeWidth = 2}: Props) {
    const shapes: Shape[] = ICONS[name];
    return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}
             strokeLinecap="round" strokeLinejoin="round" accessible={false}>
            {shapes.map((shape, index) => {
                if ("d" in shape) {
                    return <Path key={index} d={shape.d}/>;
                }
                if ("r" in shape) {
                    return <Circle key={index} cx={shape.cx} cy={shape.cy} r={shape.r}/>;
                }
                return <Rect key={index} x={shape.x} y={shape.y} width={shape.width} height={shape.height} rx={shape.rx || 0}/>;
            })}
        </Svg>
    );
}

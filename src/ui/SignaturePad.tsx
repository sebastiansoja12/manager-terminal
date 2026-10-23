import React, {useRef, useState} from "react";
import {GestureResponderEvent, LayoutChangeEvent, StyleSheet, Text, View} from "react-native";
import Svg, {Path} from "react-native-svg";
import {Button} from "./components";
import {colors, radius, spacing} from "./theme";

const PAD_HEIGHT = 180;
const STROKE_WIDTH = 3;

type Point = {x: number; y: number};

const round = (value: number) => Math.round(value * 10) / 10;

const strokePath = (stroke: Point[]) => stroke
    .map((point, index) => `${index ? "L" : "M"}${round(point.x)} ${round(point.y)}`)
    .join(" ");

export const signatureSvg = (strokes: Point[][], width: number, height: number) => (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.round(width)} ${Math.round(height)}">`
    + strokes
        .filter((stroke) => stroke.length)
        .map((stroke) => `<path d="${strokePath(stroke.length === 1 ? [stroke[0], stroke[0]] : stroke)}" fill="none" stroke="#000" stroke-width="${STROKE_WIDTH}" stroke-linecap="round" stroke-linejoin="round"/>`)
        .join("")
    + `</svg>`
);

type Props = {
    onChange: (svg: string) => void;
    required?: boolean;
};

export function SignaturePad({onChange, required}: Props) {
    const [strokes, setStrokes] = useState<Point[][]>([]);
    const strokesRef = useRef<Point[][]>([]);
    const sizeRef = useRef({width: 0, height: PAD_HEIGHT});

    const update = (next: Point[][]) => {
        strokesRef.current = next;
        setStrokes(next);
    };

    const point = (x: number, y: number): Point => ({
        x: Math.min(Math.max(x, 0), sizeRef.current.width),
        y: Math.min(Math.max(y, 0), sizeRef.current.height),
    });

    const startStroke = (event: GestureResponderEvent) => {
        update([...strokesRef.current, [point(event.nativeEvent.locationX, event.nativeEvent.locationY)]]);
    };

    const extendStroke = (event: GestureResponderEvent) => {
        const current = strokesRef.current;
        const last = current[current.length - 1] || [];
        update([...current.slice(0, -1), [...last, point(event.nativeEvent.locationX, event.nativeEvent.locationY)]]);
    };

    const finishStroke = () => {
        onChange(signatureSvg(strokesRef.current, sizeRef.current.width, sizeRef.current.height));
    };

    const clear = () => {
        update([]);
        onChange("");
    };

    const onLayout = (event: LayoutChangeEvent) => {
        sizeRef.current = {width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height};
    };

    return (
        <View style={styles.root}>
            <View style={styles.header}>
                <Text style={styles.label}>Podpis odbiorcy{required ? " *" : ""}</Text>
                {strokes.length ? <Button label="Wyczyść" variant="ghost" onPress={clear}/> : null}
            </View>
            <View
                style={styles.pad}
                onLayout={onLayout}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderTerminationRequest={() => false}
                onResponderGrant={startStroke}
                onResponderMove={extendStroke}
                onResponderRelease={finishStroke}
            >
                <Svg width="100%" height="100%" pointerEvents="none">
                    {strokes.map((stroke, index) => (
                        <Path
                            key={index}
                            d={strokePath(stroke.length === 1 ? [stroke[0], stroke[0]] : stroke)}
                            fill="none"
                            stroke={colors.text}
                            strokeWidth={STROKE_WIDTH}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                        />
                    ))}
                </Svg>
                {!strokes.length ? (
                    <Text style={styles.placeholder} pointerEvents="none">Podpisz palcem w tym polu</Text>
                ) : null}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: {gap: spacing.xs},
    header: {flexDirection: "row", alignItems: "center", justifyContent: "space-between", minHeight: 36},
    label: {color: colors.textMuted, fontSize: 13, fontWeight: "600"},
    pad: {
        height: PAD_HEIGHT,
        borderRadius: radius.md,
        borderWidth: 1,
        borderStyle: "dashed",
        borderColor: colors.border,
        backgroundColor: colors.surfaceRaised,
        overflow: "hidden",
    },
    placeholder: {
        position: "absolute",
        alignSelf: "center",
        top: PAD_HEIGHT / 2 - 10,
        color: colors.textMuted,
        fontSize: 14,
    },
});

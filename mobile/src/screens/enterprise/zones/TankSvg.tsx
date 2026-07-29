import React, { useEffect, useMemo, useRef } from "react";
import { Animated, View } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Rect, Path, Text as SvgText } from "react-native-svg";
import { useTheme, useReduceMotion } from "../../../ui";

const ARect = Animated.createAnimatedComponent(Rect);

export function TankSvg({ level, label, width = 220, height = 260 }: { level: number; label: string; width?: number; height?: number }) {
  const { c } = useTheme();
  const reduce = useReduceMotion();
  const pct = Math.max(0, Math.min(100, level));
  const anim = useRef(new Animated.Value(pct)).current;
  useEffect(() => { if (reduce) anim.setValue(pct); else Animated.timing(anim, { toValue: pct, duration: 650, useNativeDriver: false }).start(); }, [pct, reduce, anim]);
  const inner = useMemo(() => ({ x: 38, y: 24, w: width - 76, h: height - 58 }), [width, height]);
  const fillY = anim.interpolate({ inputRange: [0, 100], outputRange: [inner.y + inner.h, inner.y] });
  const fillH = anim.interpolate({ inputRange: [0, 100], outputRange: [0, inner.h] });
  return <View accessibilityRole="image" accessibilityLabel={`${label} tank level ${Math.round(pct)} percent`}>
    <Svg width={width} height={height}>
      <Defs><LinearGradient id="tankWater" x1="0" y1="0" x2="0" y2="1"><Stop offset="0" stopColor={c.cyan} stopOpacity="0.92"/><Stop offset="1" stopColor={c.accent} stopOpacity="0.88"/></LinearGradient></Defs>
      <Path d={`M ${inner.x} ${inner.y + 10} Q ${inner.x} ${inner.y} ${inner.x + 10} ${inner.y} H ${inner.x + inner.w - 10} Q ${inner.x + inner.w} ${inner.y} ${inner.x + inner.w} ${inner.y + 10} V ${inner.y + inner.h - 10} Q ${inner.x + inner.w} ${inner.y + inner.h} ${inner.x + inner.w - 10} ${inner.y + inner.h} H ${inner.x + 10} Q ${inner.x} ${inner.y + inner.h} ${inner.x} ${inner.y + inner.h - 10} Z`} fill={c.card} stroke={c.borderHi} strokeWidth={3}/>
      <ARect x={inner.x + 5} y={fillY as any} width={inner.w - 10} height={fillH as any} rx={12} fill="url(#tankWater)" />
      {[25,50,75].map((m)=><Path key={m} d={`M ${inner.x + inner.w + 8} ${inner.y + inner.h - inner.h*m/100} H ${inner.x + inner.w + 22}`} stroke={c.faint} strokeWidth={2}/>) }
      <SvgText x={width/2} y={height-14} fill={c.text} fontSize="16" fontWeight="800" textAnchor="middle">{Math.round(pct)}%</SvgText>
      <SvgText x={width/2} y={18} fill={c.faint} fontSize="12" fontWeight="700" textAnchor="middle">{label}</SvgText>
    </Svg>
  </View>;
}

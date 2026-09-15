import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  RadialGradient,
  Stop,
} from "react-native-svg";

/** Visual state of the voice persona orb. */
export type PersonaState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "asleep";

/* Colours copied verbatim from web VARIANT_COLOURS.mana. */
const COLOURS = {
  from: "#4f46e5",
  to: "#a855f7",
  glow: "rgba(129,140,248,0.45)",
  glowSolid: "#8190f8",
  ring: "rgba(167,139,250,0.55)",
};

interface StateConfig {
  scale: number[];
  glowScale: number[];
  glowOpacity: number;
  duration: number;
  shimmerRotate: boolean;
}

/* Keyframes copied verbatim from web STATE_CONFIG. */
const STATE_CONFIG: Record<PersonaState, StateConfig> = {
  idle: {
    scale: [1, 1.025, 1],
    glowScale: [1, 1.08, 1],
    glowOpacity: 0.55,
    duration: 3.2,
    shimmerRotate: false,
  },
  listening: {
    scale: [1, 1.06, 1],
    glowScale: [1, 1.22, 1],
    glowOpacity: 0.8,
    duration: 1.2,
    shimmerRotate: false,
  },
  thinking: {
    scale: [1, 1.02, 1],
    glowScale: [1, 1.12, 1],
    glowOpacity: 0.7,
    duration: 1.6,
    shimmerRotate: true,
  },
  speaking: {
    scale: [1, 1.07, 1, 1.035, 1],
    glowScale: [1, 1.28, 1, 1.14, 1],
    glowOpacity: 0.85,
    duration: 0.9,
    shimmerRotate: false,
  },
  asleep: {
    scale: [1, 1.008, 1],
    glowScale: [1, 1.04, 1],
    glowOpacity: 0.3,
    duration: 4.5,
    shimmerRotate: false,
  },
};

/** Loop through scale keyframes (frames start and end at the same value). */
function loopKeyframes(frames: number[], durationSec: number) {
  const stepMs = (durationSec * 1000) / (frames.length - 1);
  const steps = frames.slice(1).map((value) =>
    withTiming(value, {
      duration: stepMs,
      easing: Easing.inOut(Easing.ease),
    }),
  );
  const firstStep = steps.at(0);
  if (!firstStep) {
    const value = frames.at(0) ?? 1;
    return withTiming(value, { duration: durationSec * 1000 });
  }
  return withRepeat(withSequence(firstStep, ...steps.slice(1)), -1, false);
}

function RippleRing({
  size,
  inset,
  borderWidth,
  duration,
  delay,
  fromOpacity,
  toScale,
}: {
  size: number;
  inset: number;
  borderWidth: number;
  duration: number;
  delay: number;
  fromOpacity: number;
  toScale: number;
}) {
  const scale = useSharedValue(1);
  const opacity = useSharedValue(fromOpacity);

  useEffect(() => {
    scale.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(toScale, { duration, easing: Easing.out(Easing.ease) }),
          withTiming(1, { duration: 0 }),
        ),
        -1,
        false,
      ),
    );
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(0, { duration, easing: Easing.out(Easing.ease) }),
          withTiming(fromOpacity, { duration: 0 }),
        ),
        -1,
        false,
      ),
    );
    return () => {
      cancelAnimation(scale);
      cancelAnimation(opacity);
    };
  }, [scale, opacity, delay, duration, fromOpacity, toScale]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  const ringSize = size + inset * 2;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: "absolute",
          width: ringSize,
          height: ringSize,
          borderRadius: ringSize / 2,
          borderWidth,
          borderColor: COLOURS.ring,
        },
        style,
      ]}
    />
  );
}

interface PersonaOrbProps {
  state: PersonaState;
  /** Orb diameter in px (web uses 160/224). */
  size?: number;
}

/**
 * Animated voice orb — RN port of web's Persona (variant "mana") using
 * react-native-svg gradients + reanimated loops (no CSS blur on native; the
 * glow's wide radial falloff approximates web's blur-2xl).
 */
export default function PersonaOrb({ state, size = 224 }: PersonaOrbProps) {
  const config = STATE_CONFIG[state];

  const orbScale = useSharedValue(1);
  const glowScale = useSharedValue(1);
  const glowOpacity = useSharedValue(config.glowOpacity);
  const shimmerRotation = useSharedValue(0);
  const shimmerOpacity = useSharedValue(1);

  useEffect(() => {
    cancelAnimation(orbScale);
    cancelAnimation(glowScale);
    cancelAnimation(shimmerRotation);

    orbScale.value = 1;
    glowScale.value = 1;
    orbScale.value = loopKeyframes(config.scale, config.duration);
    glowScale.value = loopKeyframes(config.glowScale, config.duration);
    glowOpacity.value = withTiming(config.glowOpacity, { duration: 400 });

    if (config.shimmerRotate) {
      shimmerRotation.value = 0;
      shimmerRotation.value = withRepeat(
        withTiming(360, { duration: 2500, easing: Easing.linear }),
        -1,
        false,
      );
    } else {
      shimmerRotation.value = withTiming(0, { duration: 300 });
    }
    shimmerOpacity.value = withTiming(state === "asleep" ? 0.4 : 1, {
      duration: 600,
    });
  }, [
    state,
    config,
    orbScale,
    glowScale,
    glowOpacity,
    shimmerRotation,
    shimmerOpacity,
  ]);

  const orbStyle = useAnimatedStyle(() => ({
    transform: [{ scale: orbScale.value }],
  }));
  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ scale: glowScale.value }],
    opacity: glowOpacity.value,
  }));
  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${shimmerRotation.value}deg` }],
    opacity: shimmerOpacity.value,
  }));

  const glowSize = size * 1.5;

  return (
    <View
      style={{ width: size, height: size }}
      className="items-center justify-center"
    >
      {/* Outer glow — radial gradient fading to transparent (≈ blur-2xl). */}
      <Animated.View
        pointerEvents="none"
        style={[
          {
            position: "absolute",
            width: glowSize,
            height: glowSize,
            left: -(glowSize - size) / 2,
            top: -(glowSize - size) / 2,
          },
          glowStyle,
        ]}
      >
        <Svg width={glowSize} height={glowSize}>
          <Defs>
            <RadialGradient id="personaGlow" cx="50%" cy="50%" r="50%">
              <Stop
                offset="0%"
                stopColor={COLOURS.glowSolid}
                stopOpacity={0.45}
              />
              <Stop
                offset="55%"
                stopColor={COLOURS.glowSolid}
                stopOpacity={0.22}
              />
              <Stop
                offset="100%"
                stopColor={COLOURS.glowSolid}
                stopOpacity={0}
              />
            </RadialGradient>
          </Defs>
          <Circle
            cx={glowSize / 2}
            cy={glowSize / 2}
            r={glowSize / 2}
            fill="url(#personaGlow)"
          />
        </Svg>
      </Animated.View>

      {/* Main orb with 135° gradient + inner shimmer highlight. */}
      <Animated.View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            overflow: "hidden",
          },
          orbStyle,
        ]}
      >
        <Svg width={size} height={size}>
          <Defs>
            <LinearGradient id="personaOrb" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor={COLOURS.from} />
              <Stop offset="100%" stopColor={COLOURS.to} />
            </LinearGradient>
          </Defs>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={size / 2}
            fill="url(#personaOrb)"
          />
        </Svg>
        <Animated.View
          pointerEvents="none"
          style={[
            { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 },
            shimmerStyle,
          ]}
        >
          <Svg width={size} height={size}>
            <Defs>
              <RadialGradient id="personaShimmer" cx="35%" cy="30%" r="55%">
                <Stop offset="0%" stopColor="#ffffff" stopOpacity={0.25} />
                <Stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle
              cx={size / 2}
              cy={size / 2}
              r={size / 2}
              fill="url(#personaShimmer)"
            />
          </Svg>
        </Animated.View>
      </Animated.View>

      {/* Listening ripple ring. */}
      {state === "listening" && (
        <RippleRing
          size={size}
          inset={size * 0.08}
          borderWidth={2}
          duration={1400}
          delay={0}
          fromOpacity={0.6}
          toScale={1.18}
        />
      )}

      {/* Speaking pulse rings ×2 (second delayed 0.35s). */}
      {state === "speaking" && (
        <>
          <RippleRing
            size={size}
            inset={size * 0.1}
            borderWidth={1}
            duration={1100}
            delay={0}
            fromOpacity={0.5}
            toScale={1.25}
          />
          <RippleRing
            size={size}
            inset={size * 0.1}
            borderWidth={1}
            duration={1100}
            delay={350}
            fromOpacity={0.5}
            toScale={1.25}
          />
        </>
      )}
    </View>
  );
}

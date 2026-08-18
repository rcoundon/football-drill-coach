<script setup lang="ts">
import { computed } from 'vue'
import type { PitchType } from '../types'
import { PITCH_H, PITCH_W, m } from '../geometry'

const props = defineProps<{ type: PitchType }>()

const isHalf = computed(() => props.type === 'half')
const showMarkings = computed(() => props.type !== 'blank')

const width = computed(() => (isHalf.value ? PITCH_W / 2 : PITCH_W))

/** The left half is exactly 50 units wide; centring it needs an inset of half the remaining space. */
const groupTransform = computed(() => (isHalf.value ? `translate(${(PITCH_W - width.value) / 2} 0)` : ''))

const penaltyDepth = m(16.5)
const penaltyWidth = m(40.32)
const penaltyTop = (PITCH_H - penaltyWidth) / 2
const sixDepth = m(5.5)
const sixWidth = m(18.32)
const sixTop = (PITCH_H - sixWidth) / 2
const spotFromGoal = m(11)
const arcRadius = m(9.15)
const cornerRadius = m(1)
const goalWidth = m(7.32)
const goalTop = (PITCH_H - goalWidth) / 2
const goalDepth = m(2)

/**
 * Vertical half-chord where the penalty arc meets the box edge, derived by
 * Pythagoras from the arc radius and the horizontal gap between the box
 * edge and the penalty spot it is centred on (penaltyDepth - spotFromGoal).
 */
const arcHalfChord = Math.sqrt(arcRadius ** 2 - (penaltyDepth - spotFromGoal) ** 2)
</script>

<template>
  <g data-pitch-group :transform="groupTransform">
    <rect data-grass :x="0" :y="0" :width="width" :height="PITCH_H" fill="#2e7d32" />

    <g
      v-if="showMarkings"
      fill="none"
      stroke="#ffffff"
      stroke-width="0.35"
      stroke-opacity="0.85"
    >
      <rect data-marking="touchlines" :x="0" :y="0" :width="width" :height="PITCH_H" />

      <!-- Halfway line: the right-hand edge on a half pitch, the middle on a full one. -->
      <line
        data-marking="halfway"
        :x1="width"
        :y1="0"
        :x2="width"
        :y2="PITCH_H"
        v-if="isHalf"
      />
      <line
        data-marking="halfway"
        :x1="PITCH_W / 2"
        :y1="0"
        :x2="PITCH_W / 2"
        :y2="PITCH_H"
        v-else
      />

      <!-- Centre circle: a full circle on a full pitch, the left half of one otherwise. -->
      <circle
        data-marking="centre-circle"
        v-if="!isHalf"
        :cx="PITCH_W / 2"
        :cy="PITCH_H / 2"
        :r="arcRadius"
      />
      <path
        data-marking="centre-circle"
        v-else
        :d="`M ${width} ${PITCH_H / 2 - arcRadius} A ${arcRadius} ${arcRadius} 0 0 0 ${width} ${PITCH_H / 2 + arcRadius}`"
      />
      <circle data-marking="centre-spot" :cx="isHalf ? width : PITCH_W / 2" :cy="PITCH_H / 2" r="0.4" fill="#ffffff" />

      <!-- Left goal end -->
      <rect data-marking="penalty-area" :x="0" :y="penaltyTop" :width="penaltyDepth" :height="penaltyWidth" />
      <rect data-marking="six-yard" :x="0" :y="sixTop" :width="sixDepth" :height="sixWidth" />
      <circle data-marking="penalty-spot" :cx="spotFromGoal" :cy="PITCH_H / 2" r="0.4" fill="#ffffff" />
      <path
        data-marking="penalty-arc"
        :d="`M ${penaltyDepth} ${PITCH_H / 2 - arcHalfChord} A ${arcRadius} ${arcRadius} 0 0 0 ${penaltyDepth} ${PITCH_H / 2 + arcHalfChord}`"
      />
      <rect data-marking="goal" :x="-goalDepth" :y="goalTop" :width="goalDepth" :height="goalWidth" />
      <path data-marking="corner" :d="`M 0 ${cornerRadius} A ${cornerRadius} ${cornerRadius} 0 0 0 ${cornerRadius} 0`" />
      <path
        data-marking="corner"
        :d="`M 0 ${PITCH_H - cornerRadius} A ${cornerRadius} ${cornerRadius} 0 0 1 ${cornerRadius} ${PITCH_H}`"
      />

      <!-- Right goal end, full pitch only -->
      <template v-if="!isHalf">
        <rect
          data-marking="penalty-area"
          :x="PITCH_W - penaltyDepth"
          :y="penaltyTop"
          :width="penaltyDepth"
          :height="penaltyWidth"
        />
        <rect
          data-marking="six-yard"
          :x="PITCH_W - sixDepth"
          :y="sixTop"
          :width="sixDepth"
          :height="sixWidth"
        />
        <circle data-marking="penalty-spot" :cx="PITCH_W - spotFromGoal" :cy="PITCH_H / 2" r="0.4" fill="#ffffff" />
        <path
          data-marking="penalty-arc"
          :d="`M ${PITCH_W - penaltyDepth} ${PITCH_H / 2 - arcHalfChord} A ${arcRadius} ${arcRadius} 0 0 1 ${PITCH_W - penaltyDepth} ${PITCH_H / 2 + arcHalfChord}`"
        />
        <rect data-marking="goal" :x="PITCH_W" :y="goalTop" :width="goalDepth" :height="goalWidth" />
        <path
          data-marking="corner"
          :d="`M ${PITCH_W} ${cornerRadius} A ${cornerRadius} ${cornerRadius} 0 0 1 ${PITCH_W - cornerRadius} 0`"
        />
        <path
          data-marking="corner"
          :d="`M ${PITCH_W} ${PITCH_H - cornerRadius} A ${cornerRadius} ${cornerRadius} 0 0 0 ${PITCH_W - cornerRadius} ${PITCH_H}`"
        />
      </template>
    </g>
  </g>
</template>

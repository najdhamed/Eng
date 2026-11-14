import type { Mobility } from '../domain/types';
import type { IconName } from '../icons/paths';
import type { Step } from '../navigation/directions';
import type { PlannedRoute } from '../navigation/planner';
import type { Translator } from './translate';

export interface StepText {
  readonly title: string;
  readonly detail: string;
  /** What the voice guide says: the title and detail as one sentence. */
  readonly speech: string;
  readonly icon: IconName;
}

const TURN_ICON = { straight: 'straight', left: 'left', right: 'right', back: 'uturn' } as const;

function sentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  return /[.!؟?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

function finish(title: string, detail: string, icon: IconName): StepText {
  const body = sentence(detail);
  return { title, detail: body, speech: body ? `${title}. ${body}` : `${title}.`, icon };
}

export function describeStep(step: Step, tr: Translator, mobility: Mobility): StepText {
  const { t } = tr;

  switch (step.kind) {
    case 'start': {
      const { place } = step;
      if (place.category === 'entrance') {
        const detail =
          mobility === 'walk' ? t('dir.startEntranceDetail') : t('dir.startEntranceStepFree');
        return finish(t('dir.startEntrance'), detail, 'door');
      }
      const where = t('dir.startOn', { floor: tr.floorName(place.floor) });
      if (place.node === 'lift') return finish(t('dir.startLift'), where, 'lift');
      if (place.node === 'stairs') return finish(t('dir.startStairs'), where, 'stairs');
      return finish(t('dir.startPlace', { place: tr.name(place.name) }), where, 'locate');
    }

    case 'walk': {
      const distance = tr.distance(step.meters);
      let movement =
        step.turn === 'straight' ? t('dir.distance', { distance }) : t('dir.walkFor', { distance });
      if (step.toward) movement += ` ${t('dir.toward', { landmark: tr.name(step.toward) })}`;
      return finish(t(`dir.turn.${step.turn}`), movement, TURN_ICON[step.turn]);
    }

    case 'lift':
    case 'stairs': {
      const up = step.toFloor > step.fromFloor;
      const floor = tr.floorTo(step.toFloor);
      const floors = Math.abs(step.toFloor - step.fromFloor);
      const lift = step.kind === 'lift';
      const title = lift
        ? t(up ? 'dir.liftUp' : 'dir.liftDown', { floor })
        : t(up ? 'dir.stairsUp' : 'dir.stairsDown', { floor });
      const approach = step.approach
        ? t(lift ? `dir.liftApproach.${step.approach}` : `dir.stairsApproach.${step.approach}`)
        : null;
      const how = lift
        ? mobility === 'walk'
          ? t('dir.liftButton', {
              button: t(step.toFloor === 0 ? 'floor.liftButton.0' : `floorShort.${step.toFloor}`),
            })
          : t('dir.liftStepFree')
        : t('dir.stairsDetail', { floors: tr.count('floors', floors) });
      const detail = [approach, how].filter(Boolean).join('. ');
      return finish(title, detail, lift ? 'lift' : 'stairs');
    }

    case 'arrive': {
      const hours = step.place.hours ? t('dir.hours', { hours: tr.name(step.place.hours) }) : null;
      const detail = [t(`dir.arriveDetail.${step.side}`), hours].filter(Boolean).join('. ');
      return finish(t('dir.arrive', { place: tr.name(step.place.name) }), detail, 'pin');
    }
  }
}

/** Adds the "…and X will be on your left" clause to the last walking step. */
export function describeRoute(route: PlannedRoute, tr: Translator): StepText[] {
  const destination = tr.name(route.destination.name);
  return route.steps.map((step) => {
    const text = describeStep(step, tr, route.mobility);
    if (step.kind !== 'walk' || !step.arrivalSide) return text;
    const clause = tr.t(`dir.arrivalSide.${step.arrivalSide}`, { place: destination });
    const detail = sentence(tr.list([text.detail.replace(/[.]$/, ''), clause]));
    return { ...text, detail, speech: `${text.title}. ${detail}` };
  });
}

export function routeIntro(route: PlannedRoute, tr: Translator): string {
  return tr.t('route.intro', {
    toPlace: tr.toPlace(tr.name(route.destination.name)),
    steps: tr.count('steps', route.steps.length),
    time: tr.duration(route.metrics.seconds),
  });
}

import { useCallback, useReducer } from 'react';

/**
 * Wizard state + reducer per docs/WIZARDS.md.
 *
 * Usage:
 *   const { state, setData, goTo, goBack, submit } = useWizard<MyData>({ step0: true });
 */

export interface WizardState<T> {
  currentStep: string;
  data: Partial<T>;
  history: string[];
  isSubmitting: boolean;
  error: string | null;
}

type WizardAction<T> =
  | { type: 'GO_TO'; step: string; data?: Partial<T> }
  | { type: 'BACK' }
  | { type: 'SET_DATA'; data: Partial<T> }
  | { type: 'SUBMIT_START' }
  | { type: 'SUBMIT_SUCCESS' }
  | { type: 'SUBMIT_ERROR'; error: string }
  | { type: 'RESET'; initialStep: string; initialData?: Partial<T> };

function reducer<T>(state: WizardState<T>, action: WizardAction<T>): WizardState<T> {
  switch (action.type) {
    case 'GO_TO':
      return {
        ...state,
        currentStep: action.step,
        history: [...state.history, state.currentStep],
        data: action.data ? { ...state.data, ...action.data } : state.data,
        error: null,
      };
    case 'BACK': {
      if (state.history.length === 0) return state;
      const prev = state.history[state.history.length - 1];
      return {
        ...state,
        currentStep: prev,
        history: state.history.slice(0, -1),
        error: null,
      };
    }
    case 'SET_DATA':
      return { ...state, data: { ...state.data, ...action.data } };
    case 'SUBMIT_START':
      return { ...state, isSubmitting: true, error: null };
    case 'SUBMIT_SUCCESS':
      return { ...state, isSubmitting: false, error: null };
    case 'SUBMIT_ERROR':
      return { ...state, isSubmitting: false, error: action.error };
    case 'RESET':
      return {
        currentStep: action.initialStep,
        data: action.initialData ?? {},
        history: [],
        isSubmitting: false,
        error: null,
      };
    default:
      return state;
  }
}

export function useWizard<T>(initialStep: string, initialData: Partial<T> = {}) {
  const [state, dispatch] = useReducer(reducer<T>, {
    currentStep: initialStep,
    data: initialData,
    history: [],
    isSubmitting: false,
    error: null,
  });

  const setData = useCallback((data: Partial<T>) => {
    dispatch({ type: 'SET_DATA', data });
  }, []);

  const goTo = useCallback((step: string, data?: Partial<T>) => {
    dispatch({ type: 'GO_TO', step, data });
  }, []);

  const goBack = useCallback(() => {
    dispatch({ type: 'BACK' });
  }, []);

  const reset = useCallback(
    (step: string = initialStep, data: Partial<T> = initialData) => {
      dispatch({ type: 'RESET', initialStep: step, initialData: data });
    },
    [initialStep, initialData]
  );

  const submitStart = useCallback(() => dispatch({ type: 'SUBMIT_START' }), []);
  const submitSuccess = useCallback(() => dispatch({ type: 'SUBMIT_SUCCESS' }), []);
  const submitError = useCallback((error: string) => dispatch({ type: 'SUBMIT_ERROR', error }), []);

  return {
    state,
    setData,
    goTo,
    goBack,
    reset,
    submitStart,
    submitSuccess,
    submitError,
    canGoBack: state.history.length > 0,
  };
}

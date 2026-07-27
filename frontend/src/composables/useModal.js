import { reactive } from 'vue';

const state = reactive({
  isOpen: false,
  type: 'alert', // 'alert' ou 'confirm'
  title: '',
  message: '',
  resolvePromise: null,
});

export const useModal = () => {
  const showAlert = (title, message) => {
    state.type = 'alert';
    state.title = title;
    state.message = message;
    state.isOpen = true;
    return new Promise((resolve) => {
      state.resolvePromise = resolve;
    });
  };

  const showConfirm = (title, message) => {
    state.type = 'confirm';
    state.title = title;
    state.message = message;
    state.isOpen = true;
    return new Promise((resolve) => {
      state.resolvePromise = resolve;
    });
  };

  const close = (result) => {
    state.isOpen = false;
    if (state.resolvePromise) {
      state.resolvePromise(result);
      state.resolvePromise = null;
    }
  };

  return { state, showAlert, showConfirm, close };
};

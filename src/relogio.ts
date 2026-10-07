export interface Relogio {
  agora(): Date;
}

export const relogioDoSistema: Relogio = {
  agora() {
    return new Date();
  },
};

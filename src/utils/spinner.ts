import { Api } from 'grammy';

// 3 ulduz eyni anda fərqli ölçülərdən keçir — "qaynayan" effekti
const STARS = ['✦', '✧', '✶', '✷', '✸', '✹', '✺', '✻', '✼', '✽'];
const N = STARS.length;

// Hər frame-də 3 ulduz 3-lük offset-lə irəliləyir
// Frame 0: ✦ ✷ ✺  |  Frame 1: ✧ ✸ ✻  |  Frame 2: ✶ ✹ ✼  ...
function trail(frame: number): string {
  return `${STARS[frame % N]} ${STARS[(frame + 3) % N]} ${STARS[(frame + 6) % N]}`;
}

function progressBar(percent: number): string {
  const filled = Math.round(percent / 10);
  return '▓'.repeat(filled) + '░'.repeat(10 - filled) + `  ${Math.round(percent)}%`;
}

export class AnimatedStatus {
  private frame = 0;
  private timer: NodeJS.Timeout | null = null;
  private label = '';
  private progress: number | null = null;

  constructor(
    private readonly api: Api,
    private readonly chatId: number,
    private readonly msgId: number,
  ) {}

  start(label: string): void {
    this.label = label;
    this.frame = 0;
    this.progress = null;
    void this.render();
    this.timer = setInterval(() => {
      this.frame++;
      void this.render();
    }, 750);
  }

  setLabel(label: string): void {
    this.label = label;
  }

  setProgress(percent: number | null): void {
    this.progress = percent === null ? null : Math.min(100, Math.max(0, percent));
  }

  async stop(finalText: string): Promise<void> {
    this.clearTimer();
    await this.edit(finalText);
  }

  async delete(): Promise<void> {
    this.clearTimer();
    try {
      await this.api.deleteMessage(this.chatId, this.msgId);
    } catch {
      // Artıq silinibsə — keçirik
    }
  }

  private clearTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private buildText(): string {
    const stars = trail(this.frame);
    const line1 = `${stars}  ${this.label}`;
    if (this.progress === null) return line1;
    return `${line1}\n${progressBar(this.progress)}`;
  }

  private async render(): Promise<void> {
    await this.edit(this.buildText());
  }

  private async edit(text: string): Promise<void> {
    try {
      await this.api.editMessageText(this.chatId, this.msgId, text);
    } catch {
      // Rate limit və ya eyni mətn — keçirik
    }
  }
}

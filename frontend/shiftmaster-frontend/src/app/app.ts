import { Component, HostListener, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { Employee, EmployeeInput, Shift, ShiftInput, ShiftService, ShiftStats, ShiftType, TimeOffRequest } from './shift.service';

interface ScheduleDay {
  date: string;
  label: string;
  weekdayInitial: string;
  dayNumber: string;
  isToday: boolean;
  isWeekend: boolean;
}

interface CopyCalendarDay {
  date: string;
  dayNumber: string;
  weekdayLabel: string;
  isSource: boolean;
}

const DEPARTMENTS = ['Sanidad', 'Operaciones', 'Atención al Cliente'];
const AVATAR_COLORS = ['lavender', 'peach', 'mint', 'sky', 'rose', 'sand'];

function localDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function mondayOf(date: Date, offset = 0): Date {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - day + offset * 7);
  return monday;
}

function demoEmployees(): Employee[] {
  return [
    { id: 'emp-1', name: 'Ana Costa', email: 'ana.costa@example.com', role: 'Staff', department: 'Sanidad', maxHoursPerWeek: 40, initials: 'AC', color: 'lavender' },
    { id: 'emp-2', name: 'Marcos Ruiz', email: 'marcos.ruiz@example.com', role: 'Manager', department: 'Operaciones', maxHoursPerWeek: 40, initials: 'MR', color: 'peach' },
    { id: 'emp-3', name: 'Julia Pérez', email: 'julia.perez@example.com', role: 'Staff', department: 'Atención al Cliente', maxHoursPerWeek: 36, initials: 'JP', color: 'mint' },
    { id: 'emp-4', name: 'David López', email: 'david.lopez@example.com', role: 'Staff', department: 'Sanidad', maxHoursPerWeek: 40, initials: 'DL', color: 'sky' },
    { id: 'emp-5', name: 'Elena Martín', email: 'elena.martin@example.com', role: 'Staff', department: 'Operaciones', maxHoursPerWeek: 32, initials: 'EM', color: 'rose' },
    { id: 'emp-6', name: 'Pablo Sánchez', email: 'pablo.sanchez@example.com', role: 'Staff', department: 'Atención al Cliente', maxHoursPerWeek: 40, initials: 'PS', color: 'sand' },
  ];
}

function demoShifts(): Shift[] {
  const monday = mondayOf(new Date());
  const date = (day: number) => {
    const result = new Date(monday);
    result.setDate(result.getDate() + day);
    return localDateString(result);
  };
  const shifts: Array<Omit<Shift, 'date'> & { day: number }> = [
    { id: 'demo-1', employeeId: 'emp-1', day: 0, startTime: '08:00', endTime: '16:00', type: 'morning' },
    { id: 'demo-2', employeeId: 'emp-1', day: 2, startTime: '08:00', endTime: '16:00', type: 'morning' },
    { id: 'demo-3', employeeId: 'emp-1', day: 4, startTime: '12:00', endTime: '20:00', type: 'afternoon' },
    { id: 'demo-4', employeeId: 'emp-2', day: 0, startTime: '09:00', endTime: '17:00', type: 'afternoon' },
    { id: 'demo-5', employeeId: 'emp-2', day: 1, startTime: '22:00', endTime: '06:00', type: 'night' },
    { id: 'demo-6', employeeId: 'emp-2', day: 3, startTime: '08:00', endTime: '16:00', type: 'morning' },
    { id: 'demo-7', employeeId: 'emp-3', day: 1, startTime: '08:00', endTime: '16:00', type: 'morning' },
    { id: 'demo-8', employeeId: 'emp-3', day: 2, startTime: '14:00', endTime: '22:00', type: 'afternoon' },
    { id: 'demo-9', employeeId: 'emp-3', day: 5, startTime: '10:00', endTime: '18:00', type: 'guard' },
    { id: 'demo-10', employeeId: 'emp-4', day: 0, startTime: '20:00', endTime: '04:00', type: 'night' },
    { id: 'demo-11', employeeId: 'emp-4', day: 3, startTime: '08:00', endTime: '16:00', type: 'morning' },
    { id: 'demo-12', employeeId: 'emp-5', day: 1, startTime: '12:00', endTime: '20:00', type: 'afternoon' },
    { id: 'demo-13', employeeId: 'emp-5', day: 4, startTime: '08:00', endTime: '16:00', type: 'morning' },
    { id: 'demo-14', employeeId: 'emp-6', day: 2, startTime: '09:00', endTime: '17:00', type: 'guard' },
    { id: 'demo-15', employeeId: 'emp-6', day: 4, startTime: '14:00', endTime: '22:00', type: 'afternoon' },
  ];
  return shifts.map(({ day, ...shift }) => ({ ...shift, date: date(day) }));
}

@Component({
  imports: [FormsModule],
  selector: 'app-root',
  templateUrl: './app.html',
})
export class App implements OnInit {
  private readonly shiftService = inject(ShiftService);
  private readonly today = new Date();
  private readonly activeWeekStart = signal(mondayOf(this.today));
  readonly viewMode = signal<'week' | 'month'>('week');
  readonly selectedMonth = signal(new Date(this.today.getFullYear(), this.today.getMonth(), 1));
  readonly monthOptions = Array.from({ length: 12 }, (_, index) => ({
    value: index,
    label: new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date(2026, index, 1)),
  }));
  readonly yearOptions = Array.from({ length: 11 }, (_, index) => this.today.getFullYear() - 5 + index);

  readonly employees = signal<Employee[]>(demoEmployees());
  readonly shifts = signal<Shift[]>(demoShifts());
  readonly reportShifts = signal<Shift[]>(demoShifts());
  readonly timeOffRequests = signal<TimeOffRequest[]>([{ id: 'demo-request-1', status: 'pending' }, { id: 'demo-request-2', status: 'pending' }, { id: 'demo-request-3', status: 'pending' }]);
  readonly stats = signal<ShiftStats | null>(null);
  readonly apiPending = signal(true);
  readonly apiErrors = signal<string[]>([]);
  readonly exportingPdf = signal(false);
  readonly department = signal('Todos');
  readonly modalOpen = signal(false);
  readonly modalError = signal('');
  readonly saving = signal(false);
  readonly deletingShift = signal(false);
  readonly editingShift = signal<Shift | null>(null);
  readonly activePage = signal<'schedule' | 'employees' | 'reports'>('schedule');
  readonly employeeModalOpen = signal(false);
  readonly employeeSaving = signal(false);
  readonly employeeError = signal('');
  readonly employeeNotice = signal('');
  readonly reportEmployeeId = signal('emp-1');
  readonly copyModalOpen = signal(false);
  readonly copySourceDate = signal('');
  readonly copySourceShift = signal<Shift | null>(null);
  readonly copyMode = signal<'day' | 'single'>('day');
  readonly copyTargetDates = signal<string[]>([]);
  readonly copySaving = signal(false);
  readonly copyError = signal('');
  readonly copyNotice = signal('');
  readonly shiftNotice = signal('');
  readonly days = computed(() => this.viewMode() === 'month' ? this.createMonthDays() : this.createDays());
  readonly copyCalendarSlots = computed(() => this.createCopyCalendarSlots());
  readonly copySourceShifts = computed(() => this.shifts().filter((shift) => shift.date === this.copySourceDate()));
  readonly copyEmployee = computed(() => {
    const employeeId = this.copySourceShift()?.employeeId ?? this.copySourceShifts()[0]?.employeeId;
    return this.employees().find((employee) => employee.id === employeeId) ?? null;
  });
  readonly copySourceDateLabel = computed(() => this.formatCalendarDate(this.copySourceDate()));
  readonly copyCalendarTitle = computed(() => {
    const source = new Date(`${this.copySourceDate()}T12:00:00`);
    const month = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(source);
    return `${month.charAt(0).toLocaleUpperCase('es-ES') + month.slice(1)} ${source.getFullYear()}`;
  });
  readonly monthTitle = computed(() => {
    const month = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(this.selectedMonth());
    return `${month.charAt(0).toLocaleUpperCase('es-ES') + month.slice(1)} ${this.selectedYear()}`;
  });
  readonly visibleEmployees = computed(() => {
    const selected = this.department();
    return this.employees().filter((employee) => selected === 'Todos' || employee.department === selected);
  });
  readonly departmentOptions = computed(() => [...new Set([...DEPARTMENTS, ...this.employees().map((employee) => employee.department)])]);
  readonly selectedReportEmployee = computed(() => this.employees().find((employee) => employee.id === this.reportEmployeeId()) ?? this.employees()[0] ?? null);
  readonly employeeReportShifts = computed(() => this.reportShifts()
    .filter((shift) => shift.employeeId === this.selectedReportEmployee()?.id)
    .sort((left, right) => right.date.localeCompare(left.date) || right.startTime.localeCompare(left.startTime)));
  readonly reportMonthlyHours = computed(() => this.employeeReportShifts()
    .filter((shift) => shift.date.startsWith(localDateString(this.today).slice(0, 7)))
    .reduce((hours, shift) => hours + this.shiftHours(shift), 0));
  readonly reportWeeklyHours = computed(() => {
    const weekStart = localDateString(mondayOf(this.today));
    const weekEnd = localDateString(new Date(mondayOf(this.today).getFullYear(), mondayOf(this.today).getMonth(), mondayOf(this.today).getDate() + 7));
    return this.employeeReportShifts()
      .filter((shift) => shift.date >= weekStart && shift.date < weekEnd)
      .reduce((hours, shift) => hours + this.shiftHours(shift), 0);
  });
  readonly reportShiftCounts = computed(() => ({
    morning: this.employeeReportShifts().filter((shift) => shift.type === 'morning').length,
    afternoon: this.employeeReportShifts().filter((shift) => shift.type === 'afternoon').length,
    night: this.employeeReportShifts().filter((shift) => shift.type === 'night').length,
    guard: this.employeeReportShifts().filter((shift) => shift.type === 'guard').length,
  }));
  readonly plannedHours = computed(() => this.stats()?.plannedHours ?? this.shifts().reduce((total, shift) => total + this.shiftHours(shift), 0));
  readonly pendingRequests = computed(() => this.stats()?.pendingRequests ?? this.timeOffRequests().filter((request) => request.status.toLowerCase() === 'pending').length);
  readonly activeEmployees = computed(() => this.stats()?.activeEmployees ?? this.employees().filter((employee) => employee.active !== false).length);
  readonly coveredShifts = computed(() => this.stats()?.coveredShifts ?? this.shifts().length);
  readonly coveragePercent = computed(() => Math.min(100, Math.round((this.shifts().length / this.targetShifts) * 100)));
  readonly targetShifts = 42;
  readonly printGeneratedDate = new Intl.DateTimeFormat('es-ES', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(this.today);
  draft: ShiftInput = { employeeId: '', date: localDateString(this.today), startTime: '08:00', endTime: '16:00', type: 'morning' };
  employeeDraft: EmployeeInput = { name: '', email: '', role: 'Staff', department: '', maxHoursPerWeek: 40 };

  ngOnInit(): void {
    this.reloadData();
  }

  reloadData(): void {
    this.apiPending.set(true);
    this.apiErrors.set([]);
    let pending = 4;
    const finishRequest = () => {
      pending -= 1;
      if (pending === 0) this.apiPending.set(false);
    };
    const reportError = (error: unknown) => {
      this.apiErrors.update((errors) => [...errors, this.errorMessage(error)]);
    };
    this.shiftService.getEmployees().pipe(finalize(finishRequest)).subscribe({
      next: (employees) => {
        const normalized = employees.map((employee, index) => this.normalizeEmployee(employee, index));
        this.employees.set(normalized);
        if (!normalized.some((employee) => employee.id === this.reportEmployeeId())) {
          this.reportEmployeeId.set(normalized[0]?.id ?? '');
        }
      },
      error: reportError,
    });
    this.shiftService.getAllShifts().pipe(finalize(finishRequest)).subscribe({
      next: (shifts) => {
        const normalized = shifts.map((shift) => this.normalizeShift(shift));
        this.reportShifts.set(normalized);
        this.shifts.set(this.filterShiftsForView(normalized));
      },
      error: reportError,
    });
    this.shiftService.getTimeOff().pipe(finalize(finishRequest)).subscribe({
      next: (requests) => this.timeOffRequests.set(requests),
      error: reportError,
    });
    this.shiftService.getStats().pipe(finalize(finishRequest)).subscribe({
      next: (stats) => this.stats.set(stats),
      error: reportError,
    });
  }

  changeWeek(offset: number): void {
    const nextWeek = new Date(this.activeWeekStart());
    nextWeek.setDate(nextWeek.getDate() + offset * 7);
    this.activeWeekStart.set(nextWeek);
    const weekMonth = new Date(nextWeek);
    weekMonth.setDate(weekMonth.getDate() + 3);
    this.selectedMonth.set(new Date(weekMonth.getFullYear(), weekMonth.getMonth(), 1));
    this.shifts.set(this.filterShiftsForView(demoShiftsForWeek(this.demoWeekOffset())));
    this.reloadData();
  }

  goToToday(): void {
    this.activeWeekStart.set(mondayOf(this.today));
    this.selectedMonth.set(new Date(this.today.getFullYear(), this.today.getMonth(), 1));
    this.shifts.set(this.filterShiftsForView(demoShifts()));
    this.reloadData();
  }

  setViewMode(mode: 'week' | 'month'): void {
    this.viewMode.set(mode);
    this.shifts.set(this.filterShiftsForView(this.reportShifts()));
    this.reloadData();
  }

  navigatePeriod(offset: number): void {
    if (this.viewMode() === 'month') {
      this.changeMonth(this.selectedMonthIndex() + offset);
      return;
    }
    this.changeWeek(offset);
  }

  changeMonth(month: number): void {
    const current = this.selectedMonth();
    const selected = new Date(current.getFullYear(), month, 1);
    this.selectedMonth.set(selected);
    this.activeWeekStart.set(mondayOf(selected));
    this.shifts.set(this.filterShiftsForView(demoShiftsForWeek(this.demoWeekOffset())));
    this.reloadData();
  }

  changeYear(year: number): void {
    const current = this.selectedMonth();
    const selected = new Date(year, current.getMonth(), 1);
    this.selectedMonth.set(selected);
    this.activeWeekStart.set(mondayOf(selected));
    this.shifts.set(this.filterShiftsForView(demoShiftsForWeek(this.demoWeekOffset())));
    this.reloadData();
  }

  selectedMonthIndex(): number {
    return this.selectedMonth().getMonth();
  }

  selectedYear(): number {
    return this.selectedMonth().getFullYear();
  }

  weekLabel(): string {
    const start = this.activeWeekStart();
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const monthYear = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' });
    if (start.getMonth() === end.getMonth()) {
      return `${start.getDate()} – ${end.getDate()} ${monthYear.format(end)}`;
    }
    const monthDay = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' });
    return `${monthDay.format(start)} – ${monthDay.format(end)} ${end.getFullYear()}`;
  }

  openCopyModal(sourceDate: string): void {
    this.copyMode.set('day');
    this.copySourceDate.set(sourceDate);
    this.copySourceShift.set(null);
    this.copyTargetDates.set([]);
    this.copyError.set('');
    this.copyNotice.set('');
    this.copyModalOpen.set(true);
  }

  openSingleCopyModal(shift: Shift): void {
    this.copyMode.set('single');
    this.copySourceDate.set(shift.date);
    this.copySourceShift.set(shift);
    this.copyTargetDates.set([]);
    this.copyError.set('');
    this.copyNotice.set('');
    this.copyModalOpen.set(true);
  }

  toggleCopyTarget(date: string, selected: boolean): void {
    this.copyTargetDates.update((dates) => selected
      ? [...new Set([...dates, date])]
      : dates.filter((targetDate) => targetDate !== date));
  }

  selectAllCopyTargets(): void {
    this.copyTargetDates.set(this.copyCalendarSlots().filter((day): day is CopyCalendarDay => day !== null && !day.isSource).map((day) => day.date));
  }

  clearCopyTargets(): void {
    this.copyTargetDates.set([]);
  }

  applyBulkCopy(): void {
    const sourceDate = this.copySourceDate();
    const targetDates = this.copyTargetDates();
    if (!sourceDate || !targetDates.length) {
      this.copyError.set('Selecciona al menos un día de destino.');
      return;
    }
    if (!this.copySourceShifts().length) {
      this.copyError.set('No hay turnos asignados en la fecha de origen para copiar.');
      return;
    }
    this.copySaving.set(true);
    this.copyError.set('');
    this.shiftService.bulkCopyShifts(sourceDate, targetDates)
      .pipe(finalize(() => this.copySaving.set(false)))
      .subscribe({
        next: (result) => {
          this.reportShifts.update((shifts) => [
            ...shifts,
            ...result.created.map((shift) => this.normalizeShift(shift)),
          ]);
          this.shifts.set(this.filterShiftsForView(this.reportShifts()));
          this.copyModalOpen.set(false);
          this.copyNotice.set(
            `${result.summary.createdCount} turnos copiados en ${result.summary.targetDates} días.` +
            (result.summary.skippedCount ? ` ${result.summary.skippedCount} turnos omitidos por conflictos.` : ''),
          );
          this.reloadData();
        },
        error: (error: unknown) => this.copyError.set(this.errorMessage(error)),
      });
  }

  applySingleCopy(): void {
    const sourceShift = this.copySourceShift();
    const targetDates = this.copyTargetDates();
    if (!sourceShift) {
      this.copyError.set('No se encontró el turno que quieres duplicar.');
      return;
    }
    if (!targetDates.length) {
      this.copyError.set('Selecciona al menos una fecha de destino.');
      return;
    }
    this.copySaving.set(true);
    this.copyError.set('');
    this.shiftService.copySingleShift(sourceShift.id, targetDates)
      .pipe(finalize(() => this.copySaving.set(false)))
      .subscribe({
        next: (result) => {
          this.copyModalOpen.set(false);
          this.copyNotice.set(
            `Turno copiado a ${result.copiedDates.length} días.` +
            (result.omittedDates.length ? ` ${result.omittedDates.length} omitidos por conflictos.` : ''),
          );
          this.reloadData();
        },
        error: (error: unknown) => this.copyError.set(this.errorMessage(error)),
      });
  }

  singleShiftSummary(): string {
    const shift = this.copySourceShift();
    const employee = this.copyEmployee();
    if (!shift || !employee) return '';
    return `${employee.name} · ${this.shiftLabel(shift.type)} · ${shift.startTime} a ${shift.endTime}`;
  }

  formatCalendarDate(date: string): string {
    if (!date) return '';
    return new Intl.DateTimeFormat('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      .format(new Date(`${date}T12:00:00`));
  }

  onCopyDateChange(date: string, event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) this.toggleCopyTarget(date, target.checked);
  }

  calendarPeriodLabel(): string {
    if (this.viewMode() === 'week') return `Semana del ${this.weekLabel()}`;
    const dateCount = this.days().length;
    return `Del 1 al ${dateCount} de ${this.monthTitle()}`;
  }

  exportWeeklyPdf(): void {
    if (this.exportingPdf()) return;
    this.exportingPdf.set(true);
    requestAnimationFrame(() => window.print());
  }

  @HostListener('window:afterprint')
  finishPdfExport(): void {
    this.exportingPdf.set(false);
  }

  printableHours(employeeId: string): number {
    return this.shifts()
      .filter((shift) => shift.employeeId === employeeId && this.days().some((day) => day.date === shift.date))
      .reduce((hours, shift) => hours + this.shiftHours(shift), 0);
  }

  printableTotalHours(): number {
    const employeeIds = new Set(this.visibleEmployees().map((employee) => employee.id));
    return this.shifts()
      .filter((shift) => employeeIds.has(shift.employeeId) && this.days().some((day) => day.date === shift.date))
      .reduce((hours, shift) => hours + this.shiftHours(shift), 0);
  }

  printableDayNumber(day: ScheduleDay): number {
    return Number(day.dayNumber);
  }

  shiftsFor(employeeId: string, date: string): Shift[] {
    return this.shifts().filter((shift) => shift.employeeId === employeeId && shift.date === date);
  }

  openCell(employee: Employee, date: string): void {
    const assigned = this.shiftsFor(employee.id, date)[0];
    if (assigned) {
      this.openEdit(assigned);
      return;
    }
    this.openCreate(employee.id, date);
  }

  shiftTooltip(employee: Employee, shift: Shift): string {
    return `Empleado: ${employee.name} | Turno: ${this.shiftLabel(shift.type)} (${shift.startTime} - ${shift.endTime})`;
  }

  dayCellTooltip(employee: Employee, date: string): string {
    const shifts = this.shiftsFor(employee.id, date);
    return shifts.length
      ? shifts.map((shift) => this.shiftTooltip(employee, shift)).join('\n')
      : `Asignar turno a ${employee.name} · ${this.formatCalendarDate(date)}`;
  }

  shiftInitial(type: ShiftType): string {
    return ({ morning: 'M', afternoon: 'T', night: 'N', guard: 'G' })[type];
  }

  employeeHours(employeeId: string): number {
    return this.shifts().filter((shift) => shift.employeeId === employeeId).reduce((hours, shift) => hours + this.shiftHours(shift), 0);
  }

  employeeHoursCaption(): string {
    return this.viewMode() === 'month' ? 'este mes' : 'esta semana';
  }

  shiftLabel(type: ShiftType): string {
    return ({ morning: 'Mañana', afternoon: 'Tarde', night: 'Noche', guard: 'Guardia' })[type];
  }

  pageTitle(): string {
    return ({ schedule: 'Cuadrante semanal', employees: 'Empleados', reports: 'Informes' })[this.activePage()];
  }

  openEmployeeCreate(): void {
    this.employeeError.set('');
    this.employeeNotice.set('');
    this.employeeDraft = { name: '', email: '', role: 'Staff', department: '', maxHoursPerWeek: 40 };
    this.employeeModalOpen.set(true);
  }

  saveEmployee(): void {
    if (!this.employeeDraft.name.trim() || !this.employeeDraft.email.trim() ||
        !this.employeeDraft.department.trim() || !Number.isFinite(this.employeeDraft.maxHoursPerWeek) ||
        this.employeeDraft.maxHoursPerWeek <= 0) {
      this.employeeError.set('Completa todos los campos con datos válidos.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.employeeDraft.email.trim())) {
      this.employeeError.set('Introduce un correo electrónico válido.');
      return;
    }
    this.employeeSaving.set(true);
    this.employeeError.set('');
    this.shiftService.createEmployee({ ...this.employeeDraft, name: this.employeeDraft.name.trim(), email: this.employeeDraft.email.trim(), department: this.employeeDraft.department.trim() })
      .pipe(finalize(() => this.employeeSaving.set(false)))
      .subscribe({
        next: (employee) => {
          const normalized = this.normalizeEmployee(employee, this.employees().length);
          this.employees.update((employees) => [...employees, normalized]);
          this.reportEmployeeId.set(normalized.id);
          this.employeeModalOpen.set(false);
          this.employeeNotice.set(`${normalized.name} se añadió al equipo.`);
        },
        error: (error: unknown) => this.employeeError.set(this.errorMessage(error)),
      });
  }

  deleteEmployee(employee: Employee): void {
    if (!window.confirm(`¿Eliminar a ${employee.name}? Esta acción también puede eliminar sus turnos asociados.`)) return;
    this.shiftService.deleteEmployee(employee.id).subscribe({
      next: () => {
        this.employees.update((employees) => employees.filter((item) => item.id !== employee.id));
        this.shifts.update((shifts) => shifts.filter((shift) => shift.employeeId !== employee.id));
        this.reportShifts.update((shifts) => shifts.filter((shift) => shift.employeeId !== employee.id));
        if (this.reportEmployeeId() === employee.id) this.reportEmployeeId.set(this.employees()[0]?.id ?? '');
        this.employeeNotice.set(`${employee.name} se eliminó del equipo.`);
      },
      error: (error: unknown) => this.employeeNotice.set(this.errorMessage(error)),
    });
  }

  exportReport(): void {
    window.print();
  }

  formatReportDate(date: string): string {
    return new Intl.DateTimeFormat('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(`${date}T12:00:00`));
  }

  openCreate(employeeId = '', date = localDateString(this.today)): void {
    this.editingShift.set(null);
    this.modalError.set('');
    this.draft = { employeeId, date, startTime: '08:00', endTime: '16:00', type: 'morning' };
    this.modalOpen.set(true);
  }

  openEdit(shift: Shift): void {
    this.editingShift.set(shift);
    this.modalError.set('');
    this.draft = { employeeId: shift.employeeId, date: shift.date, startTime: shift.startTime, endTime: shift.endTime, type: shift.type };
    this.modalOpen.set(true);
  }

  closeModal(): void {
    if (!this.saving() && !this.deletingShift()) this.modalOpen.set(false);
  }

  saveShift(): void {
    if (!this.draft.employeeId || !this.draft.date || !this.draft.startTime || !this.draft.endTime) {
      this.modalError.set('Completa todos los campos para continuar.');
      return;
    }
    this.saving.set(true);
    this.modalError.set('');
    const current = this.editingShift();
    const request = current
      ? this.shiftService.updateShift(current.id, this.draft)
      : this.shiftService.createShift(this.draft);
    request.pipe(finalize(() => this.saving.set(false))).subscribe({
      next: (savedShift) => {
        if (current) {
          const normalized = this.normalizeShift(savedShift);
          this.shifts.update((shifts) => shifts.map((shift) => shift.id === current.id ? normalized : shift));
        } else {
          this.shifts.update((shifts) => [...shifts, this.normalizeShift(savedShift)]);
        }
        this.modalOpen.set(false);
      },
      error: (error: unknown) => this.modalError.set(this.errorMessage(error)),
    });
  }

  deleteShift(shift: Shift, closeModal = false): void {
    if (this.deletingShift()) return;
    const employee = this.employees().find((item) => item.id === shift.employeeId);
    const employeeName = employee?.name ?? 'este empleado';
    const confirmation = `¿Eliminar este turno de ${employeeName} para el ${this.formatCalendarDate(shift.date)}?`;
    if (!window.confirm(confirmation)) return;

    this.deletingShift.set(true);
    this.modalError.set('');
    this.shiftService.deleteShift(shift.id).pipe(finalize(() => this.deletingShift.set(false))).subscribe({
      next: () => {
        this.shifts.update((shifts) => shifts.filter((item) => item.id !== shift.id));
        this.reportShifts.update((shifts) => shifts.filter((item) => item.id !== shift.id));
        if (closeModal) {
          this.modalOpen.set(false);
          this.editingShift.set(null);
        }
        this.shiftNotice.set('Turno eliminado correctamente');
        this.reloadData();
      },
      error: (error: unknown) => {
        const message = this.errorMessage(error);
        if (closeModal) this.modalError.set(message);
        else this.apiErrors.update((errors) => [...errors, message]);
      },
    });
  }

  deleteEditingShift(): void {
    const shift = this.editingShift();
    if (shift) this.deleteShift(shift, true);
  }

  dismissShiftNotice(): void {
    this.shiftNotice.set('');
  }

  private createDays(): ScheduleDay[] {
    const start = this.activeWeekStart();
    const dayFormatter = new Intl.DateTimeFormat('es-ES', { weekday: 'short' });
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(start);
      date.setDate(date.getDate() + index);
      return {
        date: localDateString(date),
        label: dayFormatter.format(date).replace('.', '').toUpperCase(),
        weekdayInitial: this.weekdayInitial(date),
        dayNumber: String(date.getDate()).padStart(2, '0'),
        isToday: localDateString(date) === localDateString(this.today),
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
      };
    });
  }

  private createMonthDays(): ScheduleDay[] {
    const month = this.selectedMonth();
    const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const dayFormatter = new Intl.DateTimeFormat('es-ES', { weekday: 'short' });
    return Array.from({ length: daysInMonth }, (_, index) => {
      const date = new Date(month.getFullYear(), month.getMonth(), index + 1);
      return {
        date: localDateString(date),
        label: dayFormatter.format(date).replace('.', '').toUpperCase(),
        weekdayInitial: this.weekdayInitial(date),
        dayNumber: String(date.getDate()).padStart(2, '0'),
        isToday: localDateString(date) === localDateString(this.today),
        isWeekend: date.getDay() === 0 || date.getDay() === 6,
      };
    });
  }

  private weekdayInitial(date: Date): string {
    return ['D', 'L', 'M', 'X', 'J', 'V', 'S'][date.getDay()];
  }

  private createCopyCalendarSlots(): Array<CopyCalendarDay | null> {
    if (!this.copySourceDate()) return [];
    const source = new Date(`${this.copySourceDate()}T12:00:00`);
    const firstDate = new Date(source.getFullYear(), source.getMonth(), 1);
    const offset = (firstDate.getDay() + 6) % 7;
    const daysInMonth = new Date(source.getFullYear(), source.getMonth() + 1, 0).getDate();
    const weekdayFormatter = new Intl.DateTimeFormat('es-ES', { weekday: 'short' });
    const slots: Array<CopyCalendarDay | null> = Array.from({ length: offset }, () => null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(source.getFullYear(), source.getMonth(), day);
      const dateString = localDateString(date);
      slots.push({
        date: dateString,
        dayNumber: String(day),
        weekdayLabel: weekdayFormatter.format(date).replace('.', ''),
        isSource: dateString === this.copySourceDate(),
      });
    }
    return slots;
  }

  private filterShiftsForView(shifts: Shift[]): Shift[] {
    if (this.viewMode() === 'month') {
      const month = this.selectedMonth();
      const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}-`;
      return shifts.filter((shift) => shift.date.startsWith(prefix));
    }
    const visibleDates = new Set(this.days().map((day) => day.date));
    return shifts.filter((shift) => visibleDates.has(shift.date));
  }

  private demoWeekOffset(): number {
    const currentMonday = mondayOf(this.today);
    return Math.round((this.activeWeekStart().getTime() - currentMonday.getTime()) / (7 * 86400000));
  }

  private shiftHours(shift: Shift): number {
    const [startHour, startMinute] = shift.startTime.split(':').map(Number);
    const [endHour, endMinute] = shift.endTime.split(':').map(Number);
    let duration = endHour * 60 + endMinute - (startHour * 60 + startMinute);
    if (duration <= 0) duration += 24 * 60;
    return duration / 60;
  }

  private normalizeEmployee(employee: Employee, index: number): Employee {
    const initials = employee.initials || employee.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
    return { ...employee, id: String(employee.id), initials, color: employee.color || AVATAR_COLORS[index % AVATAR_COLORS.length], active: employee.active ?? true };
  }

  private normalizeShift(shift: Shift): Shift {
    return { ...shift, id: String(shift.id), employeeId: String(shift.employeeId), date: shift.date.slice(0, 10) };
  }

  private errorMessage(error: unknown): string {
    if (error && typeof error === 'object' && 'error' in error) {
      const body = error.error;
      if (body && typeof body === 'object' && 'message' in body && typeof body.message === 'string') return body.message;
      if (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string') return body.error;
      if (typeof body === 'string' && body) return body;
    }
    if (error instanceof Error) return error.message;
    return 'Ha ocurrido un error al comunicarse con el servidor.';
  }
}

function demoShiftsForWeek(offset: number): Shift[] {
  const current = demoShifts();
  if (offset === 0) return current;
  const base = mondayOf(new Date(), offset);
  const previousMonday = mondayOf(new Date());
  const delta = Math.round((base.getTime() - previousMonday.getTime()) / 86400000);
  return current.map((shift) => {
    const shifted = new Date(`${shift.date}T12:00:00`);
    shifted.setDate(shifted.getDate() + delta);
    return { ...shift, date: localDateString(shifted) };
  });
}

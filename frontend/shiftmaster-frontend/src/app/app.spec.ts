import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { vi } from 'vitest';
import { App } from './app';
import { Employee, ShiftService } from './shift.service';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [{
        provide: ShiftService,
        useValue: {
          getEmployees: () => of([]),
          getWeekShifts: () => of([]),
          getAllShifts: () => of([]),
          getTimeOff: () => of([]),
          getStats: () => of({}),
          createShift: () => throwError(() => ({ error: { error: 'El empleado ya tiene un turno asignado que se solapa en esa fecha y horario.' } })),
          createEmployee: (employee: Omit<Employee, 'id'>) => of({ ...employee, id: 'new-employee' }),
          deleteEmployee: () => of(undefined),
          deleteShift: () => of(undefined),
          bulkCopyShifts: () => of({ created: [], warnings: [], summary: { createdCount: 0, skippedCount: 0, targetDates: 0 } }),
          copySingleShift: () => of({ copiedDates: [], omittedDates: [], conflicts: [] }),
        },
      }],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render the weekly schedule and assignment action', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Cuadrante semanal');
    expect(compiled.textContent).toContain('Asignar turno');
    expect(compiled.textContent).toContain('Exportar PDF');
    expect(compiled.querySelector('.schedule-grid')).toBeTruthy();
  });

  it('should select a month and year and keep weekly navigation in sync', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const app = fixture.componentInstance;
    app.changeMonth(10);
    expect(app.monthTitle()).toBe('Noviembre 2026');
    expect(app.days()[0].date).toBe('2026-10-26');

    app.changeWeek(1);
    expect(app.days()[0].date).toBe('2026-11-02');
    expect(app.monthTitle()).toBe('Noviembre 2026');

    app.changeYear(2027);
    expect(app.monthTitle()).toBe('Noviembre 2027');
    expect(app.days()[0].date).toBe('2027-11-01');

    app.setViewMode('month');
    app.navigatePeriod(1);
    expect(app.monthTitle()).toBe('Diciembre 2027');
    expect(app.days()).toHaveLength(31);
    app.navigatePeriod(-1);
    expect(app.monthTitle()).toBe('Noviembre 2027');
  });

  it('should render the monthly grid and copy shifts to selected dates', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const app = fixture.componentInstance;
    app.changeMonth(9);
    app.setViewMode('month');
    const sourceDate = '2026-10-05';
    const copiedDate = '2026-10-12';
    const sourceShift = {
      id: 'source-shift',
      employeeId: '1',
      date: sourceDate,
      startTime: '08:00',
      endTime: '16:00',
      type: 'morning' as const,
    };
    const clonedShift = { ...sourceShift, id: 'copied-shift', date: copiedDate };
    app.shifts.set([sourceShift]);
    app.reportShifts.set([sourceShift]);
    const service = TestBed.inject(ShiftService);
    const bulkCopy = vi.spyOn(service, 'bulkCopyShifts').mockReturnValue(of({
      created: [clonedShift],
      warnings: [],
      summary: { createdCount: 1, skippedCount: 0, targetDates: 1 },
    }));
    app.reloadData = () => {};

    expect(app.days()).toHaveLength(31);
    app.openCopyModal(sourceDate);
    app.toggleCopyTarget(copiedDate, true);
    app.applyBulkCopy();
    await fixture.whenStable();

    expect(bulkCopy).toHaveBeenCalledWith(sourceDate, [copiedDate]);
    expect(app.copyModalOpen()).toBe(false);
    expect(app.reportShifts().some((shift) => shift.date === copiedDate)).toBe(true);
    expect(app.copyNotice()).toContain('1 turnos copiados');
  });

  it('should duplicate one selected shift and refresh the schedule', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const app = fixture.componentInstance;
    const employee: Employee = {
      id: '42',
      name: 'Carlos Ruiz',
      email: 'carlos@example.com',
      role: 'Staff',
      department: 'Operaciones',
      maxHoursPerWeek: 40,
    };
    const shift = {
      id: '123',
      employeeId: employee.id,
      date: '2026-10-05',
      startTime: '08:00',
      endTime: '16:00',
      type: 'morning' as const,
    };
    app.employees.set([employee]);
    app.shifts.set([shift]);
    app.openSingleCopyModal(shift);
    expect(app.copyMode()).toBe('single');
    expect(app.singleShiftSummary()).toBe('Carlos Ruiz · Mañana · 08:00 a 16:00');
    app.toggleCopyTarget('2026-10-12', true);
    const service = TestBed.inject(ShiftService);
    const copySingle = vi.spyOn(service, 'copySingleShift').mockReturnValue(of({
      copiedDates: ['2026-10-12', '2026-10-19'],
      omittedDates: ['2026-10-26'],
      conflicts: [{ date: '2026-10-26', message: 'Turno omitido por solapamiento.' }],
    }));
    const refresh = vi.spyOn(app, 'reloadData').mockImplementation(() => {});

    app.applySingleCopy();
    await fixture.whenStable();

    expect(copySingle).toHaveBeenCalledWith('123', ['2026-10-12']);
    expect(refresh).toHaveBeenCalled();
    expect(app.copyModalOpen()).toBe(false);
    expect(app.copyNotice()).toContain('Turno copiado a 2 días.');
    expect(app.copyNotice()).toContain('1 omitidos por conflictos.');
  });

  it('should show all month days without scroll and render compact shift tooltips', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const app = fixture.componentInstance;
    app.changeMonth(9);
    app.setViewMode('month');
    const employee: Employee = {
      id: 'employee-1',
      name: 'Carlos Ruiz',
      email: 'carlos@example.com',
      role: 'Staff',
      department: 'Operaciones',
      maxHoursPerWeek: 40,
    };
    app.employees.set([employee]);
    const shiftDate = '2026-10-05';
    app.shifts.set([{
      id: 'shift-1',
      employeeId: employee.id,
      date: shiftDate,
      startTime: '08:00',
      endTime: '16:00',
      type: 'morning',
    }]);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.schedule-grid')?.classList.contains('month-view')).toBe(true);
    expect(compiled.querySelectorAll('.schedule-grid > .day-header')).toHaveLength(31);
    expect(compiled.querySelector('.shift-cell.weekend-column')).toBeTruthy();
    expect(compiled.querySelector('.monthly-shift-initial')?.textContent).toBe('M');
    expect(compiled.querySelector('.shift-card')?.getAttribute('title')).toContain('Empleado: Carlos Ruiz | Turno: Mañana (08:00 - 16:00)');
    expect(compiled.querySelector(`.shift-cell[data-date="${shiftDate}"]`)?.getAttribute('title')).toContain('Empleado: Carlos Ruiz');

    (compiled.querySelector('.shift-card') as HTMLElement).click();
    fixture.detectChanges();
    expect(compiled.querySelector('#modal-title')?.textContent).toContain('Editar turno');
    app.closeModal();
    fixture.detectChanges();
    (compiled.querySelector(`.shift-cell[data-date="2026-10-06"] .empty-slot`) as HTMLElement).click();
    fixture.detectChanges();
    expect(compiled.querySelector('#modal-title')?.textContent).toContain('Asignar un turno');
  });

  it('should render a seven-day landscape schedule with shift initials for PDF printing', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const app = fixture.componentInstance;
    app.employees.set([{
      id: 'employee-1',
      name: 'Nora Vega',
      email: 'nora@example.com',
      role: 'Staff',
      department: 'Operaciones',
      maxHoursPerWeek: 40,
    }]);
    app.shifts.set([{
      id: 'shift-1',
      employeeId: 'employee-1',
      date: app.days()[0].date,
      startTime: '08:00',
      endTime: '16:00',
      type: 'morning',
    }]);
    app.exportingPdf.set(true);
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelectorAll('.print-schedule-table thead th')).toHaveLength(9);
    expect(compiled.querySelector('.print-header h1')?.textContent).toContain('Cuadrante Semanal de Turnos');
    expect(compiled.querySelector('.print-footer')?.textContent).toContain('8 h');
    expect(compiled.querySelector('.print-schedule-table tbody tr td')?.textContent?.trim()).toBe('M');
    expect(compiled.querySelector('.print-footer')?.textContent).toContain('M: Mañana | T: Tarde | N: Noche | G: Guardia Completa');
  });

  it('should render monthly PDF days and compact shift initials', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const app = fixture.componentInstance;
    const employee: Employee = {
      id: 'employee-1',
      name: 'Nora Vega',
      email: 'nora@example.com',
      role: 'Staff',
      department: 'Operaciones',
      maxHoursPerWeek: 40,
    };
    app.changeMonth(9);
    app.setViewMode('month');
    app.employees.set([employee]);
    app.shifts.set([
      { id: 'morning', employeeId: employee.id, date: '2026-10-01', startTime: '08:00', endTime: '16:00', type: 'morning' },
      { id: 'afternoon', employeeId: employee.id, date: '2026-10-02', startTime: '12:00', endTime: '20:00', type: 'afternoon' },
      { id: 'night', employeeId: employee.id, date: '2026-10-03', startTime: '20:00', endTime: '04:00', type: 'night' },
      { id: 'guard', employeeId: employee.id, date: '2026-10-04', startTime: '09:00', endTime: '17:00', type: 'guard' },
    ]);
    app.exportingPdf.set(true);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const table = compiled.querySelector('.monthly-print');
    const headers = Array.from(table?.querySelectorAll('thead th') ?? []);
    const dayHeaders = headers.slice(1, 32);
    const cells = Array.from(table?.querySelectorAll('tbody tr td') ?? []);

    expect(compiled.querySelector('.print-header h1')?.textContent).toContain('Cuadrante Mensual de Turnos');
    expect(compiled.querySelector('.export-button')?.getAttribute('aria-label')).toBe('Exportar cuadrante mensual a PDF');
    expect(dayHeaders.map((header) => header.textContent?.trim()).join(',')).toBe(
      Array.from({ length: 31 }, (_, index) => String(index + 1)).join(','),
    );
    expect(cells.slice(0, 5).map((cell) => cell.textContent?.trim())).toEqual(['M', 'T', 'N', 'G', '-']);
    expect(cells.slice(0, 4).map((cell) => cell.textContent).join(' ')).not.toContain(':');
    expect(compiled.querySelector('.print-footer')?.textContent).toContain('M: Mañana | T: Tarde | N: Noche | G: Guardia Completa');
  });

  it('should show the backend conflict message when a shift overlaps', () => {
    const fixture = TestBed.createComponent(App);
    fixture.componentInstance.openCreate('emp-1', '2026-10-24');
    fixture.componentInstance.saveShift();
    fixture.detectChanges();
    const alert = (fixture.nativeElement as HTMLElement).querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('El empleado ya tiene un turno asignado que se solapa');
  });

  it('should switch to the employee directory and add a new employee', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const app = fixture.componentInstance;
    app.activePage.set('employees');
    app.employeeDraft = {
      name: 'Nora Vega',
      email: 'nora@example.com',
      role: 'Staff',
      department: 'Operaciones',
      maxHoursPerWeek: 32,
    };
    app.saveEmployee();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(app.employees().some((employee) => employee.name === 'Nora Vega')).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Directorio de empleados');
  });

  it('should confirm shift deletion, refresh the schedule, and show success feedback', async () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    await fixture.whenStable();
    const app = fixture.componentInstance;
    const employee: Employee = {
      id: '42',
      name: 'Carlos Ruiz',
      email: 'carlos@example.com',
      role: 'Staff',
      department: 'Operaciones',
      maxHoursPerWeek: 40,
    };
    const shift = {
      id: 'shift-42',
      employeeId: employee.id,
      date: '2026-10-05',
      startTime: '08:00',
      endTime: '16:00',
      type: 'morning' as const,
    };
    app.employees.set([employee]);
    app.shifts.set([shift]);
    app.reportShifts.set([shift]);
    const service = TestBed.inject(ShiftService);
    const deleteShift = vi.spyOn(service, 'deleteShift').mockReturnValue(of(undefined));
    const refresh = vi.spyOn(app, 'reloadData').mockImplementation(() => {});
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);

    app.openEdit(shift);
    app.deleteEditingShift();
    await fixture.whenStable();

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('Carlos Ruiz'));
    expect(confirm.mock.calls[0][0]).toContain('5 de octubre de 2026');
    expect(deleteShift).toHaveBeenCalledWith('shift-42');
    expect(refresh).toHaveBeenCalled();
    expect(app.shifts()).toEqual([]);
    expect(app.reportShifts()).toEqual([]);
    expect(app.modalOpen()).toBe(false);
    expect(app.shiftNotice()).toBe('Turno eliminado correctamente');
    confirm.mockRestore();
  });

  it('should not delete a shift when confirmation is cancelled', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;
    const shift = {
      id: 'shift-42',
      employeeId: '42',
      date: '2026-10-05',
      startTime: '08:00',
      endTime: '16:00',
      type: 'morning' as const,
    };
    const service = TestBed.inject(ShiftService);
    const deleteShift = vi.spyOn(service, 'deleteShift');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    app.deleteShift(shift);

    expect(confirm).toHaveBeenCalled();
    expect(deleteShift).not.toHaveBeenCalled();
    expect(app.shifts().some((item) => item.id === shift.id)).toBe(false);
    confirm.mockRestore();
  });
});

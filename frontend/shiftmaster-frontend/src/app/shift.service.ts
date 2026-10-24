import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map, throwError } from 'rxjs';

export type ShiftType = 'morning' | 'afternoon' | 'night' | 'guard';

export interface Employee {
  id: string;
  name: string;
  email: string;
  role: 'Manager' | 'Staff';
  department: string;
  maxHoursPerWeek: number;
  initials?: string;
  color?: string;
  active?: boolean;
}

export interface Shift {
  id: string;
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  type: ShiftType;
  status?: string;
}

export interface TimeOffRequest {
  id: string;
  status: string;
}

export interface ShiftStats {
  plannedHours?: number;
  coveredShifts?: number;
  pendingRequests?: number;
  activeEmployees?: number;
}

export interface ShiftInput {
  employeeId: string;
  date: string;
  startTime: string;
  endTime: string;
  type: ShiftType;
}

export interface EmployeeInput {
  name: string;
  email: string;
  role: 'Manager' | 'Staff';
  department: string;
  maxHoursPerWeek: number;
}

export interface BulkCopyResult {
  created: Shift[];
  warnings: Array<{ targetDate: string; message: string }>;
  summary: {
    createdCount: number;
    skippedCount: number;
    targetDates: number;
  };
}

export interface SingleCopyResult {
  copiedDates: string[];
  omittedDates: string[];
  conflicts: Array<{ date: string; message: string }>;
}

const API_URL = 'http://localhost:3001/api';

@Injectable({ providedIn: 'root' })
export class ShiftService {
  private readonly http = inject(HttpClient);

  getEmployees(): Observable<Employee[]> {
    return this.http.get<unknown>(`${API_URL}/employees`).pipe(
      map((response) => this.toCollection<unknown>(response, 'employees').map((employee) => this.toEmployee(employee))),
    );
  }

  getAllShifts(): Observable<Shift[]> {
    return this.http.get<unknown>(`${API_URL}/shifts`).pipe(
      map((response) => this.toCollection<unknown>(response, 'shifts').map((shift) => this.toShift(shift))),
    );
  }

  getWeekShifts(weekStart: string): Observable<Shift[]> {
    const params = new HttpParams().set('start_date', weekStart);
    return this.http.get<unknown>(`${API_URL}/shifts/week`, { params }).pipe(
      map((response) => this.toCollection<unknown>(response, 'shifts').map((shift) => this.toShift(shift))),
    );
  }

  getTimeOff(): Observable<TimeOffRequest[]> {
    return this.http.get<unknown>(`${API_URL}/time-off`).pipe(
      map((response) => this.toCollection<unknown>(response, 'requests', 'timeOff').map((request) => this.toTimeOff(request))),
    );
  }

  getStats(): Observable<ShiftStats> {
    return this.http.get<ShiftStats>(`${API_URL}/stats`);
  }

  createShift(input: ShiftInput): Observable<Shift> {
    return this.http.post<unknown>(`${API_URL}/shifts`, this.toApiInput(input)).pipe(
      map((response) => this.toShift(response)),
    );
  }

  updateShift(id: string, input: ShiftInput): Observable<Shift> {
    return this.http.put<unknown>(`${API_URL}/shifts/${encodeURIComponent(id)}`, this.toApiInput(input)).pipe(
      map((response) => this.toShift(response)),
    );
  }

  deleteShift(id: string): Observable<void> {
    return this.http.delete<void>(`${API_URL}/shifts/${encodeURIComponent(id)}`);
  }

  bulkCopyShifts(sourceDate: string, targetDates: string[]): Observable<BulkCopyResult> {
    return this.http.post<unknown>(`${API_URL}/shifts/bulk-copy`, {
      source_date: sourceDate,
      target_dates: targetDates,
    }).pipe(map((response) => this.toBulkCopyResult(response)));
  }

  copySingleShift(shiftId: string, targetDates: string[]): Observable<SingleCopyResult> {
    const numericId = Number(shiftId);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return throwError(() => new Error('No se puede duplicar este turno porque no tiene un identificador válido del servidor.'));
    }
    return this.http.post<unknown>(`${API_URL}/shifts/copy-single`, {
      shift_id: numericId,
      target_dates: targetDates,
    }).pipe(map((response) => this.toSingleCopyResult(response)));
  }

  createEmployee(input: EmployeeInput): Observable<Employee> {
    return this.http.post<unknown>(`${API_URL}/employees`, {
      name: input.name,
      email: input.email,
      role: input.role,
      department: input.department,
      max_hours_per_week: input.maxHoursPerWeek,
    }).pipe(map((response) => this.toEmployee(response)));
  }

  deleteEmployee(id: string): Observable<void> {
    return this.http.delete<void>(`${API_URL}/employees/${encodeURIComponent(id)}`);
  }

  private toCollection<T>(response: unknown, ...keys: string[]): T[] {
    if (Array.isArray(response)) return response as T[];
    if (response && typeof response === 'object') {
      const record = response as Record<string, unknown>;
      for (const key of ['data', 'value', ...keys]) {
        if (Array.isArray(record[key])) return record[key] as T[];
      }
    }
    throw new Error(`La respuesta de ${keys[0]} no contiene una lista válida.`);
  }

  private toShift(response: unknown): Shift {
    if (!response || typeof response !== 'object') throw new Error('La respuesta del turno no es válida.');
    const shift = response as Record<string, unknown>;
    const rawType = shift['type'] ?? shift['shift_type'];
    const type = this.shiftType(rawType);
    const id = shift['id'];
    const employeeId = shift['employeeId'] ?? shift['employee_id'];
    const date = shift['date'];
    const startTime = shift['startTime'] ?? shift['start_time'];
    const endTime = shift['endTime'] ?? shift['end_time'];
    if (id === undefined || employeeId === undefined || typeof date !== 'string' || typeof startTime !== 'string' || typeof endTime !== 'string') {
      throw new Error('La respuesta del turno no contiene los campos requeridos.');
    }
    const status = shift['status'];
    return {
      id: String(id),
      employeeId: String(employeeId),
      date: date.slice(0, 10),
      startTime,
      endTime,
      type,
      ...(typeof status === 'string' ? { status } : {}),
    };
  }

  private toEmployee(response: unknown): Employee {
    if (!response || typeof response !== 'object') throw new Error('La respuesta del empleado no es válida.');
    const employee = response as Record<string, unknown>;
    const id = employee['id'];
    const name = employee['name'];
    const email = employee['email'];
    const role = employee['role'];
    const department = employee['department'];
    const maxHoursPerWeek = employee['maxHoursPerWeek'] ?? employee['max_hours_per_week'];
    if (id === undefined || typeof name !== 'string' || typeof email !== 'string' ||
        (role !== 'Manager' && role !== 'Staff') || typeof department !== 'string' ||
        typeof maxHoursPerWeek !== 'number') {
      throw new Error('La respuesta del empleado no contiene los campos requeridos.');
    }
    return {
      id: String(id),
      name,
      email,
      role,
      department,
      maxHoursPerWeek,
    };
  }

  private toBulkCopyResult(response: unknown): BulkCopyResult {
    if (!response || typeof response !== 'object') throw new Error('La respuesta de copia masiva no es válida.');
    const result = response as Record<string, unknown>;
    const summary = result['summary'];
    if (!Array.isArray(result['created']) || !Array.isArray(result['warnings']) ||
        !summary || typeof summary !== 'object') {
      throw new Error('La respuesta de copia masiva no contiene el resumen esperado.');
    }
    const rawSummary = summary as Record<string, unknown>;
    const createdCount = rawSummary['created_count'];
    const skippedCount = rawSummary['skipped_count'];
    const targetDates = rawSummary['target_dates'];
    if (typeof createdCount !== 'number' || typeof skippedCount !== 'number' || typeof targetDates !== 'number') {
      throw new Error('El resumen de copia masiva no es válido.');
    }
    return {
      created: result['created'].map((shift) => this.toShift(shift)),
      warnings: result['warnings'].map((warning) => {
        if (!warning || typeof warning !== 'object') throw new Error('La respuesta contiene una advertencia no válida.');
        const record = warning as Record<string, unknown>;
        if (typeof record['target_date'] !== 'string' || typeof record['message'] !== 'string') {
          throw new Error('La respuesta contiene una advertencia incompleta.');
        }
        return { targetDate: record['target_date'], message: record['message'] };
      }),
      summary: { createdCount, skippedCount, targetDates },
    };
  }

  private toSingleCopyResult(response: unknown): SingleCopyResult {
    if (!response || typeof response !== 'object') throw new Error('La respuesta de duplicación de turno no es válida.');
    const result = response as Record<string, unknown>;
    if (!Array.isArray(result['copied_dates']) || !Array.isArray(result['omitted_dates']) ||
        !Array.isArray(result['conflicts']) ||
        !result['copied_dates'].every((date) => typeof date === 'string') ||
        !result['omitted_dates'].every((date) => typeof date === 'string')) {
      throw new Error('La respuesta de duplicación no contiene las fechas esperadas.');
    }
    const conflicts = result['conflicts'].map((conflict) => {
      if (!conflict || typeof conflict !== 'object') throw new Error('La respuesta contiene un conflicto no válido.');
      const record = conflict as Record<string, unknown>;
      if (typeof record['date'] !== 'string' || typeof record['message'] !== 'string') {
        throw new Error('La respuesta contiene un conflicto incompleto.');
      }
      return { date: record['date'], message: record['message'] };
    });
    return {
      copiedDates: result['copied_dates'],
      omittedDates: result['omitted_dates'],
      conflicts,
    };
  }

  private toTimeOff(response: unknown): TimeOffRequest {
    if (!response || typeof response !== 'object') throw new Error('La respuesta de la solicitud de ausencia no es válida.');
    const request = response as Record<string, unknown>;
    if (request['id'] === undefined || typeof request['status'] !== 'string') {
      throw new Error('La solicitud de ausencia no contiene los campos requeridos.');
    }
    const status = request['status'].toLowerCase();
    return { id: String(request['id']), status: status === 'pendiente' ? 'pending' : status };
  }

  private shiftType(value: unknown): ShiftType {
    const types: Record<string, ShiftType> = {
      morning: 'morning',
      mañana: 'morning',
      afternoon: 'afternoon',
      tarde: 'afternoon',
      night: 'night',
      noche: 'night',
      guard: 'guard',
      guardia: 'guard',
    };
    if (typeof value === 'string' && types[value.toLowerCase()]) return types[value.toLowerCase()];
    throw new Error('La respuesta contiene un tipo de turno no válido.');
  }

  private toApiInput(input: ShiftInput): Record<string, string | number> {
    const types: Record<ShiftType, string> = {
      morning: 'Mañana',
      afternoon: 'Tarde',
      night: 'Noche',
      guard: 'Guardia',
    };
    const employeeId = Number(input.employeeId);
    return {
      employee_id: Number.isFinite(employeeId) ? employeeId : input.employeeId,
      date: input.date,
      start_time: input.startTime,
      end_time: input.endTime,
      shift_type: types[input.type],
    };
  }
}

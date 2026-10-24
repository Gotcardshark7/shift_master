const express = require('express');
const cors = require('cors');
const { all, get, run, initializeDatabase } = require('./database');

const app = express();
const PORT = Number(process.env.PORT) || 3001;
const shiftTypes = ['Mañana', 'Tarde', 'Noche', 'Guardia'];
const shiftStatuses = ['Asignado', 'Confirmado', 'Cancelado'];
const timeOffStatuses = ['Pendiente', 'Aprobado', 'Rechazado'];

app.use(cors());
app.use(express.json());

function isDate(value) {
  return typeof value === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function isTime(value) {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function hasText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveNumber(value) {
  return Number.isInteger(Number(value)) && Number(value) > 0;
}

function toMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

function shiftsOverlap(first, second) {
  const firstStart = toMinutes(first.start_time);
  const firstEnd = toMinutes(first.end_time)
    + (toMinutes(first.end_time) <= firstStart ? 1440 : 0);
  const secondStart = toMinutes(second.start_time);
  const secondEnd = toMinutes(second.end_time)
    + (toMinutes(second.end_time) <= secondStart ? 1440 : 0);

  return firstStart < secondEnd && secondStart < firstEnd;
}

function validateEmployee(body) {
  return body !== null && typeof body === 'object'
    && hasText(body.name)
    && hasText(body.email)
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)
    && ['Manager', 'Staff'].includes(body.role)
    && hasText(body.department)
    && isPositiveNumber(body.max_hours_per_week);
}

function validateShift(body) {
  return body !== null && typeof body === 'object'
    && isPositiveNumber(body.employee_id)
    && isDate(body.date)
    && isTime(body.start_time)
    && isTime(body.end_time)
    && shiftTypes.includes(body.shift_type)
    && (body.status === undefined || shiftStatuses.includes(body.status));
}

function validateTimeOff(body) {
  return body !== null && typeof body === 'object'
    && isPositiveNumber(body.employee_id)
    && isDate(body.start_date)
    && isDate(body.end_date)
    && body.start_date <= body.end_date
    && hasText(body.reason)
    && (body.status === undefined || timeOffStatuses.includes(body.status));
}

function respondWithError(res, error) {
  if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
    return res.status(409).json({ error: 'El correo electrónico ya está registrado.' });
  }
  if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
    return res.status(400).json({ error: 'El empleado indicado no existe.' });
  }
  console.error(error);
  return res.status(500).json({ error: 'Error interno del servidor.' });
}

async function seedDatabase() {
  const employeeCount = await get('SELECT COUNT(*) AS count FROM employees');
  if (employeeCount.count === 0) {
    const employees = [
      ['Ana García', 'ana.garcia@shiftmaster.test', 'Manager', 'Operaciones', 40],
      ['Luis Martínez', 'luis.martinez@shiftmaster.test', 'Staff', 'Recepción', 40],
      ['Marta López', 'marta.lopez@shiftmaster.test', 'Staff', 'Seguridad', 36],
      ['Carlos Ruiz', 'carlos.ruiz@shiftmaster.test', 'Staff', 'Operaciones', 40],
      ['Elena Sánchez', 'elena.sanchez@shiftmaster.test', 'Staff', 'Seguridad', 32],
    ];
    for (const employee of employees) {
      await run(
        'INSERT INTO employees (name, email, role, department, max_hours_per_week) VALUES (?, ?, ?, ?, ?)',
        employee,
      );
    }
  }

  const shiftCount = await get('SELECT COUNT(*) AS count FROM shifts');
  if (shiftCount.count === 0) {
    const employees = await all('SELECT id FROM employees ORDER BY id LIMIT 5');
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    const samples = [
      [0, 0, '08:00', '16:00', 'Mañana'],
      [1, 0, '08:00', '16:00', 'Mañana'],
      [2, 1, '16:00', '22:00', 'Tarde'],
      [3, 1, '16:00', '22:00', 'Tarde'],
      [4, 2, '22:00', '06:00', 'Noche'],
      [1, 3, '08:00', '16:00', 'Mañana'],
      [2, 4, '16:00', '22:00', 'Tarde'],
      [3, 5, '22:00', '06:00', 'Guardia'],
    ];
    for (const [employeeIndex, dayOffset, startTime, endTime, type] of samples) {
      const date = new Date(start);
      date.setUTCDate(date.getUTCDate() + dayOffset);
      await run(
        `INSERT INTO shifts (employee_id, date, start_time, end_time, shift_type)
         VALUES (?, ?, ?, ?, ?)`,
        [
          employees[employeeIndex % employees.length].id,
          date.toISOString().slice(0, 10),
          startTime,
          endTime,
          type,
        ],
      );
    }
  }
}

app.get('/api/employees', async (req, res) => {
  try {
    res.json(await all('SELECT * FROM employees ORDER BY id'));
  } catch (error) {
    respondWithError(res, error);
  }
});

app.post('/api/employees', async (req, res) => {
  if (!validateEmployee(req.body)) {
    return res.status(400).json({ error: 'Datos de empleado inválidos o incompletos.' });
  }
  try {
    const result = await run(
      `INSERT INTO employees (name, email, role, department, max_hours_per_week)
       VALUES (?, ?, ?, ?, ?)`,
      [
        req.body.name.trim(),
        req.body.email.trim(),
        req.body.role,
        req.body.department.trim(),
        Number(req.body.max_hours_per_week),
      ],
    );
    res.status(201).json(await get('SELECT * FROM employees WHERE id = ?', [result.lastID]));
  } catch (error) {
    respondWithError(res, error);
  }
});

app.delete('/api/employees/:id', async (req, res) => {
  try {
    const result = await run('DELETE FROM employees WHERE id = ?', [req.params.id]);
    if (!result.changes) {
      return res.status(404).json({ error: 'Empleado no encontrado.' });
    }
    res.status(204).end();
  } catch (error) {
    respondWithError(res, error);
  }
});

app.get('/api/shifts', async (req, res) => {
  try {
    res.json(await all(
      `SELECT shifts.*, employees.name AS employee_name
       FROM shifts JOIN employees ON employees.id = shifts.employee_id
       ORDER BY date, start_time, shifts.id`,
    ));
  } catch (error) {
    respondWithError(res, error);
  }
});

app.get('/api/shifts/month', async (req, res) => {
  const { year, month } = req.query;
  if (
    typeof year !== 'string'
    || !/^\d{4}$/.test(year)
    || Number(year) < 1
    || typeof month !== 'string'
    || !/^(0[1-9]|1[0-2])$/.test(month)
  ) {
    return res.status(400).json({ error: 'year y month deben tener formato YYYY y MM válido.' });
  }

  const startDate = `${year}-${month}-01`;
  const nextMonthYear = Number(month) === 12 ? Number(year) + 1 : Number(year);
  const nextMonth = Number(month) === 12 ? 1 : Number(month) + 1;
  const endDate = nextMonthYear > 9999
    ? `${year}-${month}-32`
    : `${String(nextMonthYear).padStart(4, '0')}-${String(nextMonth).padStart(2, '0')}-01`;

  try {
    res.json(await all(
      `SELECT shifts.*, employees.name AS employee_name
       FROM shifts JOIN employees ON employees.id = shifts.employee_id
       WHERE shifts.date >= ? AND shifts.date < ?
       ORDER BY shifts.date, shifts.start_time, shifts.id`,
      [startDate, endDate],
    ));
  } catch (error) {
    respondWithError(res, error);
  }
});

app.post('/api/shifts/bulk-copy', async (req, res) => {
  const body = req.body;
  if (
    body === null
    || typeof body !== 'object'
    || !isDate(body.source_date)
    || !Array.isArray(body.target_dates)
    || !body.target_dates.every(isDate)
    || (body.employee_id !== undefined && !isPositiveNumber(body.employee_id))
  ) {
    return res.status(400).json({
      error: 'source_date y target_dates deben contener fechas válidas; employee_id debe ser un entero positivo.',
    });
  }

  try {
    if (body.employee_id !== undefined) {
      const employee = await get('SELECT id FROM employees WHERE id = ?', [body.employee_id]);
      if (!employee) {
        return res.status(400).json({ error: 'El empleado indicado no existe.' });
      }
    }

    const sourceShifts = await all(
      `SELECT id, employee_id, start_time, end_time, shift_type
       FROM shifts
       WHERE date = ? AND status != 'Cancelado'
         AND (? IS NULL OR employee_id = ?)
       ORDER BY start_time, id`,
      [
        body.source_date,
        body.employee_id === undefined ? null : Number(body.employee_id),
        body.employee_id === undefined ? null : Number(body.employee_id),
      ],
    );
    const created = [];
    const warnings = [];
    const targetDates = [...new Set(body.target_dates)];

    for (const targetDate of targetDates) {
      const targetShifts = sourceShifts.length > 0
        ? await all(
          `SELECT id, employee_id, start_time, end_time
           FROM shifts
           WHERE date = ? AND status != 'Cancelado'`,
          [targetDate],
        )
        : [];

      for (const sourceShift of sourceShifts) {
        const conflictingShift = targetShifts.find((shift) => (
          shift.employee_id === sourceShift.employee_id && shiftsOverlap(sourceShift, shift)
        ));
        if (conflictingShift) {
          warnings.push({
            target_date: targetDate,
            source_shift_id: sourceShift.id,
            employee_id: sourceShift.employee_id,
            conflicting_shift_id: conflictingShift.id,
            message: 'Turno omitido por solapamiento con un turno existente o copiado anteriormente.',
          });
          continue;
        }

        const result = await run(
          `INSERT INTO shifts (employee_id, date, start_time, end_time, shift_type, status)
           VALUES (?, ?, ?, ?, ?, 'Asignado')`,
          [
            sourceShift.employee_id,
            targetDate,
            sourceShift.start_time,
            sourceShift.end_time,
            sourceShift.shift_type,
          ],
        );
        const clonedShift = {
          id: result.lastID,
          source_shift_id: sourceShift.id,
          employee_id: sourceShift.employee_id,
          date: targetDate,
          start_time: sourceShift.start_time,
          end_time: sourceShift.end_time,
          shift_type: sourceShift.shift_type,
          status: 'Asignado',
        };
        created.push(clonedShift);
        targetShifts.push(clonedShift);
      }
    }

    res.status(created.length > 0 ? 201 : 200).json({
      created,
      warnings,
      summary: {
        created_count: created.length,
        skipped_count: warnings.length,
        target_dates: targetDates.length,
      },
    });
  } catch (error) {
    respondWithError(res, error);
  }
});

app.post('/api/shifts/copy-single', async (req, res) => {
  const body = req.body;
  if (
    body === null
    || typeof body !== 'object'
    || !isPositiveNumber(body.shift_id)
    || !Array.isArray(body.target_dates)
    || !body.target_dates.every(isDate)
  ) {
    return res.status(400).json({
      error: 'shift_id debe ser un entero positivo y target_dates debe contener fechas válidas.',
    });
  }

  try {
    const sourceShift = await get(
      `SELECT id, employee_id, start_time, end_time, shift_type, status
       FROM shifts
       WHERE id = ?`,
      [Number(body.shift_id)],
    );
    if (!sourceShift) {
      return res.status(404).json({ error: 'Turno origen no encontrado.' });
    }

    const copiedDates = [];
    const omittedDates = [];
    const conflicts = [];
    const targetDates = [...new Set(body.target_dates)];

    for (const targetDate of targetDates) {
      const existingShifts = await all(
        `SELECT id, start_time, end_time
         FROM shifts
         WHERE employee_id = ? AND date = ? AND status != 'Cancelado'`,
        [sourceShift.employee_id, targetDate],
      );
      const conflict = sourceShift.status !== 'Cancelado'
        && existingShifts.find((shift) => shiftsOverlap(sourceShift, shift));

      if (conflict) {
        omittedDates.push(targetDate);
        conflicts.push({
          date: targetDate,
          conflicting_shift_id: conflict.id,
          message: 'Turno omitido por solapamiento con un turno existente.',
        });
        continue;
      }

      await run(
        `INSERT INTO shifts (employee_id, date, start_time, end_time, shift_type, status)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          sourceShift.employee_id,
          targetDate,
          sourceShift.start_time,
          sourceShift.end_time,
          sourceShift.shift_type,
          sourceShift.status,
        ],
      );
      copiedDates.push(targetDate);
    }

    res.status(copiedDates.length > 0 ? 201 : 200).json({
      copied_dates: copiedDates,
      omitted_dates: omittedDates,
      conflicts,
    });
  } catch (error) {
    respondWithError(res, error);
  }
});

app.post('/api/shifts', async (req, res) => {
  if (!validateShift(req.body)) {
    return res.status(400).json({ error: 'Datos de turno inválidos o incompletos.' });
  }
  try {
    const employee = await get('SELECT id FROM employees WHERE id = ?', [req.body.employee_id]);
    if (!employee) {
      return res.status(400).json({ error: 'El empleado indicado no existe.' });
    }

    const existingShifts = await all(
      `SELECT start_time, end_time FROM shifts
       WHERE employee_id = ? AND date = ? AND status != 'Cancelado'`,
      [req.body.employee_id, req.body.date],
    );
    const overlaps = existingShifts.some((shift) => shiftsOverlap(req.body, shift));
    if (overlaps) {
      return res.status(400).json({
        error: 'El empleado ya tiene un turno asignado que se solapa en esa fecha y horario.',
      });
    }

    const result = await run(
      `INSERT INTO shifts (employee_id, date, start_time, end_time, shift_type, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        Number(req.body.employee_id),
        req.body.date,
        req.body.start_time,
        req.body.end_time,
        req.body.shift_type,
        req.body.status || 'Asignado',
      ],
    );
    res.status(201).json(await get('SELECT * FROM shifts WHERE id = ?', [result.lastID]));
  } catch (error) {
    respondWithError(res, error);
  }
});

app.put('/api/shifts/:id', async (req, res) => {
  if (!validateShift(req.body)) {
    return res.status(400).json({ error: 'Datos de turno inválidos o incompletos.' });
  }
  try {
    const existing = await get('SELECT id FROM shifts WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Turno no encontrado.' });
    }
    const employee = await get('SELECT id FROM employees WHERE id = ?', [req.body.employee_id]);
    if (!employee) {
      return res.status(400).json({ error: 'El empleado indicado no existe.' });
    }
    const result = await run(
      `UPDATE shifts
       SET employee_id = ?, date = ?, start_time = ?, end_time = ?, shift_type = ?, status = ?
       WHERE id = ?`,
      [
        Number(req.body.employee_id),
        req.body.date,
        req.body.start_time,
        req.body.end_time,
        req.body.shift_type,
        req.body.status || 'Asignado',
        req.params.id,
      ],
    );
    res.json(await get('SELECT * FROM shifts WHERE id = ?', [req.params.id]));
  } catch (error) {
    respondWithError(res, error);
  }
});

app.delete('/api/shifts/:id', async (req, res) => {
  try {
    const result = await run('DELETE FROM shifts WHERE id = ?', [req.params.id]);
    if (!result.changes) {
      return res.status(404).json({ error: 'Turno no encontrado.' });
    }
    res.status(204).end();
  } catch (error) {
    respondWithError(res, error);
  }
});

app.get('/api/shifts/employee/:id', async (req, res) => {
  try {
    res.json(await all(
      'SELECT * FROM shifts WHERE employee_id = ? ORDER BY date, start_time',
      [req.params.id],
    ));
  } catch (error) {
    respondWithError(res, error);
  }
});

app.get('/api/shifts/week', async (req, res) => {
  const { start_date: startDate } = req.query;
  if (!isDate(startDate)) {
    return res.status(400).json({ error: 'start_date debe tener formato YYYY-MM-DD válido.' });
  }
  try {
    res.json(await all(
      `SELECT shifts.*, employees.name AS employee_name
       FROM shifts JOIN employees ON employees.id = shifts.employee_id
       WHERE date >= ? AND date < date(?, '+7 days')
       ORDER BY date, start_time, shifts.id`,
      [startDate, startDate],
    ));
  } catch (error) {
    respondWithError(res, error);
  }
});

app.get('/api/time-off', async (req, res) => {
  try {
    res.json(await all(
      `SELECT time_off_requests.*, employees.name AS employee_name
       FROM time_off_requests JOIN employees ON employees.id = time_off_requests.employee_id
       ORDER BY start_date, time_off_requests.id`,
    ));
  } catch (error) {
    respondWithError(res, error);
  }
});

app.post('/api/time-off', async (req, res) => {
  if (!validateTimeOff(req.body)) {
    return res.status(400).json({ error: 'Datos de solicitud de libre inválidos o incompletos.' });
  }
  try {
    const result = await run(
      `INSERT INTO time_off_requests (employee_id, start_date, end_date, reason, status)
       VALUES (?, ?, ?, ?, ?)`,
      [
        Number(req.body.employee_id),
        req.body.start_date,
        req.body.end_date,
        req.body.reason.trim(),
        req.body.status || 'Pendiente',
      ],
    );
    res.status(201).json(await get('SELECT * FROM time_off_requests WHERE id = ?', [result.lastID]));
  } catch (error) {
    respondWithError(res, error);
  }
});

app.put('/api/time-off/:id', async (req, res) => {
  if (!validateTimeOff(req.body)) {
    return res.status(400).json({ error: 'Datos de solicitud de libre inválidos o incompletos.' });
  }
  try {
    const result = await run(
      `UPDATE time_off_requests
       SET employee_id = ?, start_date = ?, end_date = ?, reason = ?, status = ?
       WHERE id = ?`,
      [
        Number(req.body.employee_id),
        req.body.start_date,
        req.body.end_date,
        req.body.reason.trim(),
        req.body.status || 'Pendiente',
        req.params.id,
      ],
    );
    if (!result.changes) {
      return res.status(404).json({ error: 'Solicitud de libre no encontrada.' });
    }
    res.json(await get('SELECT * FROM time_off_requests WHERE id = ?', [req.params.id]));
  } catch (error) {
    respondWithError(res, error);
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const hoursByEmployee = await all(`
      SELECT employees.id AS employee_id, employees.name,
        ROUND(SUM(
          (CAST(substr(shifts.end_time, 1, 2) AS INTEGER) * 60
            + CAST(substr(shifts.end_time, 4, 2) AS INTEGER)
            + CASE WHEN shifts.end_time <= shifts.start_time THEN 1440 ELSE 0 END
            - CAST(substr(shifts.start_time, 1, 2) AS INTEGER) * 60
            - CAST(substr(shifts.start_time, 4, 2) AS INTEGER)) / 60.0
        ), 2) AS total_hours
      FROM employees LEFT JOIN shifts
        ON shifts.employee_id = employees.id AND shifts.status != 'Cancelado'
      GROUP BY employees.id, employees.name
      ORDER BY employees.id
    `);
    const monthlyShifts = await get(
      `SELECT COUNT(*) AS total FROM shifts
       WHERE strftime('%Y-%m', date) = strftime('%Y-%m', 'now')
         AND status != 'Cancelado'`,
    );
    res.json({ hours_by_employee: hoursByEmployee, monthly_shifts: monthlyShifts.total });
  } catch (error) {
    respondWithError(res, error);
  }
});

async function startServer() {
  await initializeDatabase();
  await seedDatabase();
  return app.listen(PORT, () => {
    console.log(`ShiftMaster API escuchando en el puerto ${PORT}`);
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error('No se pudo iniciar ShiftMaster:', error);
    process.exitCode = 1;
  });
}

module.exports = { app, startServer };

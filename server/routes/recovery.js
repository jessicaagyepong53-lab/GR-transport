const router = require('express').Router();
const Trash = require('../models/Trash');
const Truck = require('../models/Truck');
const YearEntry = require('../models/YearEntry');
const WeeklyEntry = require('../models/WeeklyEntry');
const MonthlyEntry = require('../models/MonthlyEntry');
const ExpenseBreakdown = require('../models/ExpenseBreakdown');
const SalaryPayment = require('../models/SalaryPayment');
const ReferenceFile = require('../models/ReferenceFile');
const { requireAdmin } = require('../middleware/auth');
const { asyncHandler, AppError, toObjectId } = require('../utils/errors');

// GET /api/recovery — list trashed items
router.get('/', asyncHandler(async (req, res) => {
  const items = await Trash.find().sort('-deletedAt');
  const result = items.map(item => {
    const daysLeft = Math.max(0, Math.ceil((item.expiresAt - Date.now()) / (24 * 60 * 60 * 1000)));
    // Reference files carry their full base64 content in Trash so they can
    // be restored properly — but that's too heavy to send just to render a
    // list. Strip it here; the restore endpoint reads the full document.
    let data = item.data;
    if (item.type === 'referenceFile' && data && data.content) {
      const { content, ...rest } = data;
      data = { ...rest, hasContent: true };
    }
    return {
      _id: item._id,
      type: item.type,
      label: item.label,
      data,
      deletedAt: item.deletedAt,
      daysLeft
    };
  });
  res.json(result);
}));

// POST /api/recovery/:id/restore — restore trashed item
router.post('/:id/restore', requireAdmin, asyncHandler(async (req, res) => {
  const id = toObjectId(req.params.id);
  const item = await Trash.findById(id);
  if (!item) throw new AppError('Trash item not found', 404);

  if (item.type === 'truck') {
    const truckData = item.data.truck;
    const yearEntries = item.data.yearEntries || [];
    const weeklyEntries = item.data.weeklyEntries || [];

    // Restore truck (all fields)
    await Truck.findOneAndUpdate(
      { truckId: truckData.truckId },
      {
        truckId: truckData.truckId,
        driver: truckData.driver,
        driverNotes: truckData.driverNotes || '',
        startDates: truckData.startDates || {},
        purchaseYear: truckData.purchaseYear,
        cost: truckData.cost,
        endOfTerm: truckData.endOfTerm
      },
      { upsert: true }
    );

    // Restore year entries
    for (const ye of yearEntries) {
      await YearEntry.findOneAndUpdate(
        { truckId: ye.truckId, year: ye.year },
        { gross: ye.gross, exp: ye.exp, net: ye.net, weeks: ye.weeks },
        { upsert: true }
      );
    }

    // Restore weekly entries
    const affectedYears = new Set();
    for (const we of weeklyEntries) {
      await WeeklyEntry.findOneAndUpdate(
        { truckId: we.truckId, year: we.year, week: we.week },
        { daysWorked: we.daysWorked, gross: we.gross, maint: we.maint, other: we.other, notes: we.notes, remarks: we.remarks },
        { upsert: true }
      );
      affectedYears.add(we.year);
    }

    // Recompute fleet aggregates for affected years
    const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    for (const year of affectedYears) {
      const allWeekly = await WeeklyEntry.aggregate([
        { $match: { year } },
        { $group: { _id: null, maint: { $sum: '$maint' }, other: { $sum: '$other' } } }
      ]);
      if (allWeekly.length) {
        await ExpenseBreakdown.findOneAndUpdate({ year }, { maint: allWeekly[0].maint, other: allWeekly[0].other }, { upsert: true });
      }
      await MonthlyEntry.deleteMany({ year, truckId: '_fleet' });
      const allEntries = await WeeklyEntry.find({ year });
      const monthMap = {};
      allEntries.forEach(e => {
        const jan4 = new Date(year, 0, 4);
        const dayOfWeek = jan4.getDay() || 7;
        const w1Monday = new Date(jan4);
        w1Monday.setDate(jan4.getDate() - (dayOfWeek - 1));
        const monday = new Date(w1Monday);
        monday.setDate(w1Monday.getDate() + (e.week - 1) * 7);
        const mon = MONTH_NAMES[monday.getMonth()];
        if (!monthMap[mon]) monthMap[mon] = { gross: 0, exp: 0 };
        monthMap[mon].gross += e.gross || 0;
        monthMap[mon].exp += (e.maint || 0) + (e.other || 0);
      });
      const monthDocs = Object.entries(monthMap).map(([month, data]) => ({
        year, month, truckId: '_fleet', gross: data.gross, exp: data.exp
      }));
      if (monthDocs.length) await MonthlyEntry.insertMany(monthDocs);
    }
  } else if (item.type === 'yearEntry') {
    const ye = item.data;
    await YearEntry.findOneAndUpdate(
      { truckId: ye.truckId, year: ye.year },
      { gross: ye.gross, exp: ye.exp, net: ye.net, weeks: ye.weeks },
      { upsert: true }
    );
  } else if (item.type === 'weeklyEntry') {
    const we = item.data;
    await WeeklyEntry.findOneAndUpdate(
      { truckId: we.truckId, year: we.year, week: we.week },
      { daysWorked: we.daysWorked, gross: we.gross, maint: we.maint, other: we.other, notes: we.notes || '', remarks: we.remarks || '' },
      { upsert: true }
    );
    // Recompute rollups for this truck+year
    const recomputeYearFromWeekly = require('./weekly').recomputeYearFromWeekly;
    if (recomputeYearFromWeekly) {
      await recomputeYearFromWeekly(we.truckId, we.year);
    }
  } else if (item.type === 'salaryPayment') {
    const sp = item.data;
    await SalaryPayment.create({
      truckId: sp.truckId,
      year: sp.year,
      datePaid: sp.datePaid,
      amount: sp.amount || 0,
      note: sp.note || ''
    });
  } else if (item.type === 'referenceFile') {
    const rf = item.data;
    if (!rf.content) {
      throw new AppError('This file\'s content is missing and cannot be restored', 400);
    }
    await ReferenceFile.create({
      originalName: rf.originalName,
      mimeType: rf.mimeType,
      size: rf.size,
      content: Buffer.from(rf.content, 'base64'),
      category: rf.category || 'General',
      subheading: rf.subheading || '',
      notes: rf.notes || ''
    });
  }

  await item.deleteOne();
  res.json({ success: true, message: `${item.label} restored` });
}));

// DELETE /api/recovery/:id — permanently delete
router.delete('/:id', requireAdmin, asyncHandler(async (req, res) => {
  const id = toObjectId(req.params.id);
  const item = await Trash.findByIdAndDelete(id);
  if (!item) throw new AppError('Trash item not found', 404);
  res.json({ success: true });
}));

// DELETE /api/recovery — purge all
router.delete('/', requireAdmin, asyncHandler(async (req, res) => {
  const result = await Trash.deleteMany({});
  res.json({ success: true, deleted: result.deletedCount });
}));

module.exports = router;
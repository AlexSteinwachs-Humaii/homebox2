package reporting

import (
	"bytes"
	"encoding/csv"
	"sort"
	"strconv"
	"strings"
	"unicode"

	"github.com/sysadminsmedia/homebox/backend/internal/data/repo"
)

// DashboardCSV encodes the existing statistics responses, not inventory records.
// Column and row ordering are part of the documented dashboard CSV contract.
func DashboardCSV(stats repo.GroupStatistics, locations, tags []repo.TotalsByOrganizer, prices *repo.ValueOverTime, currency string) ([]byte, error) {
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	write := func(metric, breakdown, id, label, value, unit, date string) error {
		return w.Write([]string{metric, breakdown, safeCSVText(id), safeCSVText(label), value, safeCSVText(unit), date})
	}
	if err := w.Write([]string{"metric", "breakdown", "breakdown_id", "breakdown_label", "value", "unit", "date"}); err != nil {
		return nil, err
	}
	summaries := []struct {
		name  string
		value int
		unit  string
	}{
		{"totalUsers", stats.TotalUsers, "users"},
		{"totalItems", stats.TotalItems, "items"},
		{"totalLocations", stats.TotalLocations, "locations"},
		{"totalTags", stats.TotalTags, "tags"},
	}
	for _, s := range summaries {
		if err := write(s.name, "", "", "", strconv.Itoa(s.value), s.unit, ""); err != nil {
			return nil, err
		}
	}
	number := func(v float64) string { return strconv.FormatFloat(v, 'f', -1, 64) }
	if err := write("totalItemPrice", "", "", "", number(stats.TotalItemPrice), currency, ""); err != nil {
		return nil, err
	}
	if err := write("totalWithWarranty", "", "", "", strconv.Itoa(stats.TotalWithWarranty), "items", ""); err != nil {
		return nil, err
	}
	for _, section := range []struct {
		name string
		rows []repo.TotalsByOrganizer
	}{{"location", locations}, {"tag", tags}} {
		// Sort a copy: encoding must not change the dashboard response's slices.
		rows := append([]repo.TotalsByOrganizer(nil), section.rows...)
		sort.Slice(rows, func(i, j int) bool { return rows[i].ID.String() < rows[j].ID.String() })
		for _, row := range rows {
			if err := write("purchasePrice", section.name, row.ID.String(), row.Name, number(row.Total), currency, ""); err != nil {
				return nil, err
			}
		}
	}
	if prices != nil {
		if err := write("valueAtStart", "", "", "", number(prices.PriceAtStart), currency, prices.Start.Format("2006-01-02")); err != nil {
			return nil, err
		}
		if err := write("valueAtEnd", "", "", "", number(prices.PriceAtEnd), currency, prices.End.Format("2006-01-02")); err != nil {
			return nil, err
		}
		// The API entries are per creation event. Coalesce them into daily summaries;
		// never emit item names, IDs, or individual inventory rows.
		daily := map[string]float64{}
		for _, entry := range prices.Entries {
			daily[entry.Date.UTC().Format("2006-01-02")] += entry.Value
		}
		dates := make([]string, 0, len(daily))
		for date := range daily {
			dates = append(dates, date)
		}
		sort.Strings(dates)
		for _, date := range dates {
			if err := write("purchasePrice", "day", "", "", number(daily[date]), currency, date); err != nil {
				return nil, err
			}
		}
	}
	w.Flush()
	return buf.Bytes(), w.Error()
}

// Neutralize spreadsheet formulas, including formulas hidden after whitespace.
// Numeric values are deliberately not treated as text (negative numbers stay numeric).
func safeCSVText(s string) string {
	trimmed := strings.TrimLeftFunc(s, func(r rune) bool { return unicode.IsSpace(r) || unicode.IsControl(r) || r == '\uFEFF' })
	if strings.HasPrefix(s, "\t") || strings.HasPrefix(s, "\r") || strings.HasPrefix(s, "\n") || (len(trimmed) > 0 && strings.ContainsRune("=+-@", rune(trimmed[0]))) {
		return "'" + s
	}
	return s
}

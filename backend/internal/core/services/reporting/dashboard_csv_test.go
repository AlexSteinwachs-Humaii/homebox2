package reporting

import (
	"encoding/csv"
	"strings"
	"testing"
	"time"
	"unicode/utf8"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/sysadminsmedia/homebox/backend/internal/data/repo"
)

func TestDashboardCSVSchemaEscapingAndSummaries(t *testing.T) {
	id := uuid.New()
	label := "Étage, \"北\"\nsecond line"
	date := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	data, err := DashboardCSV(repo.GroupStatistics{TotalUsers: 2, TotalItems: 3, TotalLocations: 4, TotalTags: 5, TotalItemPrice: 12.5, TotalWithWarranty: 1}, []repo.TotalsByOrganizer{{ID: id, Name: label, Total: 12.5}}, []repo.TotalsByOrganizer{{ID: id, Name: " =HYPERLINK(\"bad\")", Total: -2}}, &repo.ValueOverTime{Start: date, End: date.AddDate(0, 0, 1), PriceAtStart: 1, PriceAtEnd: 6, Entries: []repo.ValueOverTimeEntry{{Date: date, Value: 2, Name: "private inventory"}, {Date: date.Add(time.Hour), Value: 3, Name: "another item"}}}, "EUR")
	require.NoError(t, err)
	require.True(t, utf8.Valid(data))
	rows, err := csv.NewReader(strings.NewReader(string(data))).ReadAll()
	require.NoError(t, err)
	require.Equal(t, []string{"metric", "breakdown", "breakdown_id", "breakdown_label", "value", "unit", "date"}, rows[0])
	require.Equal(t, []string{"totalItemPrice", "", "", "", "12.5", "EUR", ""}, rows[5])
	require.Equal(t, []string{"purchasePrice", "location", id.String(), label, "12.5", "EUR", ""}, rows[7])
	require.Equal(t, "' =HYPERLINK(\"bad\")", rows[8][3])
	require.Equal(t, "-2", rows[8][4])
	require.Equal(t, []string{"purchasePrice", "day", "", "", "5", "EUR", "2026-10-01"}, rows[11])
	require.Len(t, rows, 12)
	require.NotContains(t, string(data), "private inventory")
}

func TestDashboardCSVEmptyAndMissingUnit(t *testing.T) {
	data, err := DashboardCSV(repo.GroupStatistics{}, nil, nil, &repo.ValueOverTime{}, "")
	require.NoError(t, err)
	rows, err := csv.NewReader(strings.NewReader(string(data))).ReadAll()
	require.NoError(t, err)
	require.Len(t, rows, 9) // header, six real zero summaries, two time-series totals; no invented breakdowns
	for _, row := range rows[1:] {
		require.Equal(t, "0", row[4])
	}
	require.Empty(t, rows[5][5]) // unknown currency is not replaced with a default
}

func TestDashboardCSVCompleteStableBreakdowns(t *testing.T) {
	entries := make([]repo.TotalsByOrganizer, 150)
	for i := range entries {
		entries[i] = repo.TotalsByOrganizer{ID: uuid.New(), Name: "label", Total: float64(i)}
	}
	before := append([]repo.TotalsByOrganizer(nil), entries...)
	data, err := DashboardCSV(repo.GroupStatistics{}, entries, nil, nil, "USD")
	require.NoError(t, err)
	rows, err := csv.NewReader(strings.NewReader(string(data))).ReadAll()
	require.NoError(t, err)
	require.Len(t, rows, 157)
	for i := 8; i < len(rows); i++ {
		require.Less(t, rows[i-1][2], rows[i][2])
	}
	require.Equal(t, before, entries)
}

func TestSafeCSVText(t *testing.T) {
	for _, value := range []string{"=1+1", "+cmd", "-cmd", "@SUM(A1)", "  =cmd", "\ttext", "\rtext", "\ntext", "\ufeff=cmd", "\x00=cmd"} {
		require.Equal(t, "'"+value, safeCSVText(value))
	}
	for _, value := range []string{"", "plain", "北", "item-name", "hello\nworld"} {
		require.Equal(t, value, safeCSVText(value))
	}
}

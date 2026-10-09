package v1

import (
	"context"
	"encoding/csv"
	"fmt"
	"net/http/httptest"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
	"github.com/sysadminsmedia/homebox/backend/internal/core/services"
	"github.com/sysadminsmedia/homebox/backend/internal/core/services/reporting/eventbus"
	"github.com/sysadminsmedia/homebox/backend/internal/data/ent/enttest"
	"github.com/sysadminsmedia/homebox/backend/internal/data/repo"
	"github.com/sysadminsmedia/homebox/backend/internal/sys/config"
	_ "github.com/sysadminsmedia/homebox/backend/pkgs/cgofreesqlite"
)

func TestStatisticsCSVMatchesCollectionReports(t *testing.T) {
	ctx := context.Background()
	db := enttest.Open(t, "sqlite3", "file:dashboard-csv?mode=memory&cache=shared&_fk=1&_time_format=sqlite")
	defer db.Close()
	repos := repo.New(db, eventbus.New(), config.Storage{PrefixPath: "/", ConnString: "file://" + t.TempDir()}, "mem://{{ .Topic }}", config.Thumbnail{})
	ctrl := &V1Controller{repo: repos}
	group := db.Group.Create().SetName("selected").SetCurrency("eur").SaveX(ctx)
	other := db.Group.Create().SetName("other").SaveX(ctx)
	itemType := db.EntityType.Create().SetName("item").SetGroupID(group.ID).SaveX(ctx)
	locType := db.EntityType.Create().SetName("location").SetIsLocation(true).SetGroupID(group.ID).SaveX(ctx)
	otherType := db.EntityType.Create().SetName("item").SetGroupID(other.ID).SaveX(ctx)
	location := db.Entity.Create().SetName("Étage, \"北\"\nline").SetGroupID(group.ID).SetEntityTypeID(locType.ID).SaveX(ctx)
	tag := db.Tag.Create().SetName("=unsafe").SetGroupID(group.ID).SaveX(ctx)
	date := time.Date(2026, 10, 2, 12, 0, 0, 0, time.UTC)
	db.Entity.Create().SetName("private-item").SetGroupID(group.ID).SetEntityTypeID(itemType.ID).SetParentID(location.ID).AddTagIDs(tag.ID).SetCreatedAt(date).SetPurchasePrice(12.5).SetQuantity(2).SaveX(ctx)
	db.Entity.Create().SetName("private-item-2").SetGroupID(group.ID).SetEntityTypeID(itemType.ID).SetCreatedAt(date.Add(time.Hour)).SetPurchasePrice(2.5).SaveX(ctx)
	// Even malformed cross-collection associations must not leak into breakdowns.
	db.Entity.Create().SetName("foreign-secret").SetGroupID(other.ID).SetEntityTypeID(otherType.ID).SetParentID(location.ID).AddTagIDs(tag.ID).SetCreatedAt(date).SetPurchasePrice(999).SaveX(ctx)
	// More than a UI page of organizers must all be included.
	for i := 0; i < 110; i++ {
		tg := db.Tag.Create().SetName(fmt.Sprintf("tag-%03d", i)).SetGroupID(group.ID).SaveX(ctx)
		db.Entity.Create().SetName("inventory").SetGroupID(group.ID).SetEntityTypeID(itemType.ID).AddTagIDs(tg.ID).SetCreatedAt(date.AddDate(0, -1, 0)).SetPurchasePrice(1).SaveX(ctx)
	}
	tenantCtx := services.SetTenantCtx(ctx, group.ID)
	request := httptest.NewRequest("GET", "/groups/statistics/export?start=2026-10-01&end=2026-10-03&pageSize=1&groupId="+other.ID.String(), nil).WithContext(tenantCtx)
	response := httptest.NewRecorder()
	require.NoError(t, ctrl.HandleGroupStatisticsCSV()(response, request))
	require.Equal(t, "text/csv; charset=utf-8", response.Header().Get("Content-Type"))
	require.Contains(t, response.Header().Get("Content-Disposition"), ".csv")
	require.Equal(t, "no-store", response.Header().Get("Cache-Control"))
	rows, err := csv.NewReader(strings.NewReader(response.Body.String())).ReadAll()
	require.NoError(t, err)
	stats, err := repos.Groups.StatsGroup(ctx, group.ID)
	require.NoError(t, err)
	require.Equal(t, strconv.Itoa(stats.TotalItems), rows[2][4])
	require.Equal(t, strconv.FormatFloat(stats.TotalItemPrice, 'f', -1, 64), rows[5][4])
	require.Equal(t, "EUR", rows[5][5])
	locations, err := repos.Groups.StatsLocationsByPurchasePrice(ctx, group.ID)
	require.NoError(t, err)
	require.Len(t, locations, 1)
	require.Equal(t, 12.5, locations[0].Total)
	require.Equal(t, locations[0].Name, rows[7][3])
	tags, err := repos.Groups.StatsTagsByPurchasePrice(ctx, group.ID)
	require.NoError(t, err)
	require.Len(t, tags, 111)
	for _, tg := range tags {
		found := false
		for _, row := range rows {
			if row[1] == "tag" && row[2] == tg.ID.String() {
				require.Equal(t, strconv.FormatFloat(tg.Total, 'f', -1, 64), row[4])
				found = true
			}
		}
		require.True(t, found)
	}
	prices, err := repos.Groups.StatsPurchasePrice(ctx, group.ID, time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC), time.Date(2026, 10, 3, 0, 0, 0, 0, time.UTC))
	require.NoError(t, err)
	require.Equal(t, strconv.FormatFloat(prices.PriceAtStart, 'f', -1, 64), rows[len(rows)-3][4])
	require.Equal(t, strconv.FormatFloat(prices.PriceAtEnd, 'f', -1, 64), rows[len(rows)-2][4])
	require.Equal(t, []string{"purchasePrice", "day", "", "", "15", "EUR", "2026-10-02"}, rows[len(rows)-1])
	require.NotContains(t, response.Body.String(), "foreign-secret")
	require.NotContains(t, response.Body.String(), "private-item")
	require.NotContains(t, response.Body.String(), "999")

	// Selecting an empty collection changes every aggregation, not just the header.
	empty := db.Group.Create().SetName("empty").SaveX(ctx)
	request = request.WithContext(services.SetTenantCtx(ctx, empty.ID))
	response = httptest.NewRecorder()
	require.NoError(t, ctrl.HandleGroupStatisticsCSV()(response, request))
	rows, err = csv.NewReader(strings.NewReader(response.Body.String())).ReadAll()
	require.NoError(t, err)
	require.Len(t, rows, 9)
	for _, row := range rows[1:] {
		require.Equal(t, "0", row[4])
	}
}

func TestStatisticsCSVBadDatesDoNotReturnDownload(t *testing.T) {
	for _, query := range []string{"start=bad", "end=bad"} {
		response := httptest.NewRecorder()
		err := (&V1Controller{}).HandleGroupStatisticsCSV()(response, httptest.NewRequest("GET", "/?"+query, nil))
		require.Error(t, err)
		require.Empty(t, response.Header().Get("Content-Disposition"))
		require.Empty(t, response.Body.String())
	}
}

func TestStatisticsDateRangeDefaultsAndParsing(t *testing.T) {
	now := time.Date(2026, 10, 9, 12, 30, 0, 0, time.UTC)
	start, end, err := statisticsDateRange(httptest.NewRequest("GET", "/", nil), now)
	require.NoError(t, err)
	require.Equal(t, now.AddDate(0, -1, 0), start)
	require.Equal(t, now, end)
	start, end, err = statisticsDateRange(httptest.NewRequest("GET", "/?start=2026-01-01&end=2026-02-01", nil), now)
	require.NoError(t, err)
	require.Equal(t, "2026-01-01", start.Format("2006-01-02"))
	require.Equal(t, "2026-02-01", end.Format("2006-01-02"))
}

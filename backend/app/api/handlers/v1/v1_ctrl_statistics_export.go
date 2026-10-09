package v1

import (
	"net/http"
	"time"

	"github.com/hay-kot/httpkit/errchain"
	"github.com/sysadminsmedia/homebox/backend/internal/core/services"
	"github.com/sysadminsmedia/homebox/backend/internal/core/services/reporting"
	"github.com/sysadminsmedia/homebox/backend/internal/sys/validate"
)

// HandleGroupStatisticsCSV godoc
//
// @Summary Export dashboard summary statistics as CSV
// @Description Fixed columns: metric,breakdown,breakdown_id,breakdown_label,value,unit,date. Collection summaries and organizer breakdowns are collection-wide; start/end apply only to the purchase-price time series, as in the JSON statistics API. Time-series entries are aggregated by UTC day, never exported as inventory records.
// @Tags Statistics
// @Produce text/csv
// @Param start query string false "start date (YYYY-MM-DD; default one month ago)"
// @Param end query string false "end date (YYYY-MM-DD; default now)"
// @Success 200 {file} file
// @Router /v1/groups/statistics/export [GET]
// @Security Bearer
func (ctrl *V1Controller) HandleGroupStatisticsCSV() errchain.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) error {
		start, end, err := statisticsDateRange(r, time.Now())
		if err != nil {
			return validate.NewRequestError(err, http.StatusBadRequest)
		}
		// The route uses the same authentication/membership middleware as the JSON
		// statistics endpoints. Never accept a collection ID from the query string.
		ctx := services.NewContext(r.Context())
		group, err := ctrl.repo.Groups.GroupByID(ctx, ctx.GID)
		if err != nil {
			return err
		}
		stats, err := ctrl.repo.Groups.StatsGroup(ctx, ctx.GID)
		if err != nil {
			return err
		}
		locations, err := ctrl.repo.Groups.StatsLocationsByPurchasePrice(ctx, ctx.GID)
		if err != nil {
			return err
		}
		tags, err := ctrl.repo.Groups.StatsTagsByPurchasePrice(ctx, ctx.GID)
		if err != nil {
			return err
		}
		prices, err := ctrl.repo.Groups.StatsPurchasePrice(ctx, ctx.GID, start, end)
		if err != nil {
			return err
		}
		data, err := reporting.DashboardCSV(stats, locations, tags, prices, group.Currency)
		if err != nil {
			return err
		}
		// Generate completely before sending CSV headers; errors must not become downloads.
		w.Header().Set("Content-Type", "text/csv; charset=utf-8")
		w.Header().Set("Content-Disposition", `attachment; filename="homebox-dashboard-summary.csv"`)
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		_, err = w.Write(data)
		return err
	}
}

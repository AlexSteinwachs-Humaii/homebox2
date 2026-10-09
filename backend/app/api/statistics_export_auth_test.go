package main

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"
	"github.com/stretchr/testify/require"
	"github.com/sysadminsmedia/homebox/backend/app/api/handlers/v1"
	"github.com/sysadminsmedia/homebox/backend/internal/core/services"
	"github.com/sysadminsmedia/homebox/backend/internal/data/repo"
	"github.com/sysadminsmedia/homebox/backend/internal/sys/validate"
)

func TestStatisticsCSVAuthenticationAndTenantMiddleware(t *testing.T) {
	a := &app{}
	// Exercise the same middleware and handler used by /groups/statistics/export.
	// A nil controller repository also proves rejected requests cannot query data.
	csvHandler := (&v1.V1Controller{}).HandleGroupStatisticsCSV()
	w := httptest.NewRecorder()
	err := a.mwAuthToken(a.mwTenant(csvHandler)).ServeHTTP(w, httptest.NewRequest("GET", "/api/v1/groups/statistics/export", nil))
	var requestErr *validate.RequestError
	require.ErrorAs(t, err, &requestErr)
	require.Equal(t, http.StatusUnauthorized, requestErr.Status)
	require.Empty(t, w.Header().Get("Content-Disposition"))
	require.Empty(t, w.Body.String())

	allowed, foreign := uuid.New(), uuid.New()
	ctx := services.SetUserCtx(context.Background(), &repo.UserOut{ID: uuid.New(), DefaultGroupID: allowed, GroupIDs: []uuid.UUID{allowed}}, "test")
	for _, useHeader := range []bool{true, false} {
		r := httptest.NewRequest("GET", "/api/v1/groups/statistics/export?tenant="+foreign.String(), nil).WithContext(ctx)
		if useHeader {
			r.Header.Set("X-Tenant", foreign.String())
		}
		w = httptest.NewRecorder()
		err = a.mwTenant(csvHandler).ServeHTTP(w, r)
		require.ErrorAs(t, err, &requestErr)
		require.Equal(t, http.StatusForbidden, requestErr.Status)
		require.Empty(t, w.Header().Get("Content-Disposition"))
		require.Empty(t, w.Body.String())
	}
}

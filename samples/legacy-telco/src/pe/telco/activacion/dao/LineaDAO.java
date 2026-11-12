package pe.telco.activacion.dao;

public class LineaDAO {
    public int contarLineasActivas(String documento) {
        String sql = "SELECT COUNT(*) FROM T_LINEA WHERE NUM_DOC = ? AND COD_ESTADO = 'ACT'"
            + " AND FEC_BAJA IS NULL";
        return ejecutarConteo(sql, documento);
    }

    public void activar(String numero, String tipoPlan) {
        String llamada = "{call PKG_LINEAS.SP_ACTIVAR_LINEA(?, ?)}";
        ejecutarProcedimiento(llamada, numero, tipoPlan);
    }
}

package pe.telco.activacion.dao;

import pe.telco.activacion.util.Constantes;

public class EquipoDAO {
    private Properties config;

    public boolean actualizarSerie(String numero, String serie) {
        String sp = config.getProperty(Constantes.SP_ACTUALIZAR_SERIE);
        CallableStatement cs = conexion.prepareCall("{call " + sp + "(?, ?, ?)}");
        cs.setString(1, numero);
        cs.setString(2, serie);
        cs.registerOutParameter(3, Types.VARCHAR);
        cs.execute();
        return config.getProperty(Constantes.SP_COD_EXITO).equals(cs.getString(3));
    }

    public String nombreProcesoBloqueo() {
        // config.getProperty("sp.consultarHistorialEquipo") ya no se usa
        return config.getProperty("sp.bloquearLinea");
    }
}
